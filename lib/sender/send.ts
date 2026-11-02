import { logActivity, type Actor } from "@/lib/activity";
import { env } from "@/lib/config/env";
import { getCandidate } from "@/lib/data/candidates";
import { getSettings } from "@/lib/data/settings";
import { getDb } from "@/lib/db/client";
import { loadJob, prepareDraft } from "@/lib/drafting/prepare";
import { sendMail } from "@/lib/mail";
import type { Candidate, OutboxRow, ReplyCategory, Settings, Stage } from "@/lib/types";

export type SendSummary = {
  sent: number;
  failed: number;
  skipped: number;
  sentToday: number;
  dailyLimit: number;
  limitReached: boolean;
  recovered: number;
};

/** Rows stuck in "sending" this long are marked failed (never re-sent automatically). */
const STUCK_MINUTES = 15;

export function replyToAddress(candidate: Pick<Candidate, "reply_token">, settings: Pick<Settings, "reply_domain">): string | undefined {
  const domain = (settings.reply_domain || env().replyDomain || "").trim();
  if (domain) return `${candidate.reply_token}@${domain}`;
  return env().replyToAddress || undefined;
}

/** The stage a candidate moves to once this email is sent. */
export function stageAfterSend(type: OutboxRow["type"], current: Stage): Stage {
  if (current === "paused" || current === "hired" || current === "rejected") return current;
  switch (type) {
    case "outreach":
      return current === "new" ? "contacted" : current;
    case "interview_invite":
      return "interview_invited";
    case "feedback":
      return "feedback_sent";
    default:
      return current;
  }
}

async function sentToday(tz: string): Promise<number> {
  const db = await getDb();
  return (await db.query<{ n: number }>("select sent_today_count($1) as n", [tz]))[0]?.n ?? 0;
}

/** Marks rows stuck in "sending" (e.g. the server crashed mid-send) as failed so HR can decide. */
async function recoverStuck(): Promise<number> {
  const db = await getDb();
  const rows = await db.query<{ id: string }>(
    `update outbox set status = 'failed',
       error = 'Sending was interrupted. Check the Sent folder in Brevo before retrying, so the candidate does not get it twice.'
     where status = 'sending' and claimed_at < now() - ($1 || ' minutes')::interval returning id`,
    [String(STUCK_MINUTES)],
  );
  return rows.length;
}

/**
 * Sends approved emails, oldest first, up to the daily limit.
 * Each row is claimed atomically (approved -> sending), so running this twice
 * at the same time can never send an email twice.
 */
export async function sendApproved(opts: { actor: Actor; ids?: string[]; max?: number } = { actor: "cron" }): Promise<SendSummary> {
  const db = await getDb();
  const e = env();
  const settings = await getSettings();
  const recovered = await recoverStuck();
  const summary: SendSummary = {
    sent: 0,
    failed: 0,
    skipped: 0,
    sentToday: await sentToday(e.timezone),
    dailyLimit: settings.daily_send_limit,
    limitReached: false,
    recovered,
  };

  const candidates = await db.query<{ id: string }>(
    `select id from outbox where status = 'approved' ${opts.ids ? "and id = any($2::uuid[])" : ""}
     order by approved_at nulls last, created_at limit $1`,
    opts.ids ? [opts.max ?? 200, opts.ids] : [opts.max ?? 200],
  );

  for (const { id } of candidates) {
    const claimed = await db.query<OutboxRow>("select * from claim_outbox_for_send($1, $2, $3)", [id, settings.daily_send_limit, e.timezone]);
    const row = claimed[0];
    if (!row) {
      summary.sentToday = await sentToday(e.timezone);
      if (summary.sentToday >= settings.daily_send_limit) {
        summary.limitReached = true;
        break;
      }
      summary.skipped += 1; // someone else claimed it first
      continue;
    }
    const outcome = await sendClaimed(row, settings, opts.actor);
    if (outcome === "sent") summary.sent += 1;
    else if (outcome === "failed") summary.failed += 1;
    else summary.skipped += 1;
  }
  summary.sentToday = await sentToday(e.timezone);
  if (summary.sentToday >= settings.daily_send_limit) summary.limitReached = true;
  if (summary.sent || summary.failed || summary.limitReached || recovered) {
    await logActivity({ actor: opts.actor, action: "send.run", details: { ...summary } });
  }
  return summary;
}

async function release(id: string, status: "rejected" | "needs_review" | "failed", error: string, extra: Record<string, unknown> = {}) {
  const db = await getDb();
  const sets = ["status = $2", "error = $3"];
  const params: unknown[] = [id, status, error];
  if (status === "needs_review") sets.push("approved = false");
  if ("checker_issues" in extra) {
    params.push(JSON.stringify(extra.checker_issues));
    sets.push(`checker_issues = $${params.length}`);
  }
  await db.query(`update outbox set ${sets.join(", ")} where id = $1 and status = 'sending'`, params);
}

async function sendClaimed(row: OutboxRow, settings: Settings, actor: Actor): Promise<"sent" | "failed" | "skipped"> {
  const db = await getDb();
  const candidate = await getCandidate(row.candidate_id);
  if (!candidate) {
    await release(row.id, "rejected", "The candidate was deleted.");
    return "skipped";
  }

  // Skip suppressed / do-not-email addresses.
  const suppressed = (await db.query<{ reason: string }>("select reason from suppression where email = $1", [row.to_email]))[0];
  if (suppressed || candidate.do_not_email) {
    const why = suppressed ? `on the suppression list (${suppressed.reason})` : "on the do-not-email list";
    await release(row.id, "rejected", `Not sent: this address is ${why}.`);
    await logActivity({ actor, action: "send.skipped_suppressed", entity: "outbox", entityId: row.id, details: { reason: why } });
    return "skipped";
  }

  // HR edited the email: run the deterministic checks again before it goes out.
  if (row.edited_by_hr) {
    const job = await loadJob(row.job_id);
    const reply = row.reply_category ? { subject: null, text: "", category: row.reply_category as ReplyCategory } : undefined;
    const envd = await prepareDraft({ settings, job, candidate, type: row.type, reply, storedLink: row.interview_link });
    const result = envd.rules({ subject: row.subject, body: row.body }, { subject: row.subject, html: row.html, text: row.text });
    if (!result.passed) {
      await release(row.id, "needs_review", "Your edits did not pass the checks. Fix them and approve again.", { checker_issues: result.issues });
      await logActivity({ actor, action: "send.blocked_edit_failed_checks", entity: "outbox", entityId: row.id, details: { issues: result.issues.map((i) => i.rule) } });
      return "skipped";
    }
  }

  const e = env();
  if (!settings.sender_email && !e.mockEmail) {
    await release(row.id, "failed", "No sender email is set. Add it in Settings, then retry.");
    return "failed";
  }

  let res: Awaited<ReturnType<typeof sendMail>>;
  try {
    res = await sendMail({
      to: { email: row.to_email, name: candidate.name },
      from: { email: settings.sender_email || "hr@example.com", name: settings.sender_name },
      replyTo: replyToAddress(candidate, settings),
      subject: row.subject,
      html: row.html,
      text: row.text,
      kind: "candidate",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await release(row.id, "failed", message);
    await logActivity({ actor, action: "email.failed", entity: "outbox", entityId: row.id, details: { error: message, type: row.type } });
    return "failed";
  }

  // The provider accepted the email. From here on it must count as SENT, even if
  // the bookkeeping below has a problem; otherwise a retry could send it twice.
  await db.query("update outbox set status = 'sent', sent_at = now(), brevo_message_id = $2, error = null where id = $1", [row.id, res.messageId]);
  try {
    await db.tx(async (q) => {
      await q.query(
        `insert into messages (candidate_id, direction, from_email, to_email, subject, body_text, body_html, outbox_id)
         values ($1, 'out', $2, $3, $4, $5, $6, $7)`,
        [candidate.id, settings.sender_email || null, row.to_email, row.subject, row.text, row.html, row.id],
      );
      const nextStage = stageAfterSend(row.type, candidate.stage);
      await q.query(
        `update candidates set stage = $2, last_contacted_at = now(),
           followup_count = case when $3 = 'followup' then followup_count + 1 when $3 in ('outreach', 'interview_invite') then 0 else followup_count end
         where id = $1`,
        [candidate.id, nextStage, row.type],
      );
    });
  } catch (err) {
    await logActivity({
      actor,
      action: "email.sent_bookkeeping_failed",
      entity: "outbox",
      entityId: row.id,
      details: { error: err instanceof Error ? err.message : String(err) },
    });
  }
  await logActivity({
    actor,
    action: res.mock ? "email.sent_mock" : "email.sent",
    entity: "outbox",
    entityId: row.id,
    details: { candidate_id: candidate.id, type: row.type, to: row.to_email, message_id: res.messageId },
  });
  return "sent";
}
