import { logActivity } from "@/lib/activity";
import { env } from "@/lib/config/env";
import { getSettings } from "@/lib/data/settings";
import { resolveTemplate } from "@/lib/data/templates";
import { getDb } from "@/lib/db/client";
import { buildTemplateData } from "@/lib/email/data";
import { renderEmail } from "@/lib/email/render";
import { sendMail } from "@/lib/mail";
import { dateInTz } from "@/lib/time";
import { EMAIL_TYPE_LABELS, STAGE_LABELS, STAGES, type CheckerIssue, type EmailType } from "@/lib/types";

export type DigestData = {
  date: string;
  draftsWaiting: number;
  needsReview: { candidate: string; type: EmailType; reason: string }[];
  linkMissing: { candidate: string; job: string | null }[];
  replies: { candidate: string; category: string; subject: string | null }[];
  sentToday: number;
  dailyLimit: number;
  failures: { candidate: string; type: EmailType; error: string | null }[];
  unknownSenders: { from: string | null; subject: string | null }[];
  stageCounts: Record<string, number>;
  ai: { requests: number; limit: number; byModel: { model: string; requests: number }[] };
};

/** Collects everything for the evening summary. "Today" is midnight to now in APP_TIMEZONE. */
export async function collectDigest(): Promise<DigestData> {
  const db = await getDb();
  const e = env();
  const settings = await getSettings();
  const date = dateInTz(e.timezone);
  const dayStart = "(date_trunc('day', now() at time zone $1) at time zone $1)";

  const [drafts, review, missing, replies, sent, failures, unknown, stages, ai] = await Promise.all([
    db.query<{ n: number }>("select count(*)::int as n from outbox where status = 'draft'"),
    db.query<{ candidate: string; type: EmailType; issues: CheckerIssue[] }>(
      "select c.name as candidate, o.type, o.checker_issues as issues from outbox o join candidates c on c.id = o.candidate_id where o.status = 'needs_review' order by o.created_at limit 30",
    ),
    db.query<{ candidate: string; job: string | null }>(
      "select c.name as candidate, j.title as job from outbox o join candidates c on c.id = o.candidate_id left join jobs j on j.id = o.job_id where o.status = 'link_missing' order by o.created_at limit 30",
    ),
    db.query<{ candidate: string; category: string; subject: string | null }>(
      `select c.name as candidate, coalesce(m.category, 'pending') as category, m.subject from messages m join candidates c on c.id = m.candidate_id
       where m.direction = 'in' and m.created_at >= ${dayStart} order by m.created_at limit 50`,
      [e.timezone],
    ),
    db.query<{ n: number }>("select sent_today_count($1) as n", [e.timezone]),
    db.query<{ candidate: string; type: EmailType; error: string | null }>(
      `select c.name as candidate, o.type, o.error from outbox o join candidates c on c.id = o.candidate_id
       where o.status = 'failed' and o.updated_at >= ${dayStart} order by o.updated_at limit 30`,
      [e.timezone],
    ),
    db.query<{ from: string | null; subject: string | null }>(
      `select from_email as "from", subject from messages where category = 'unknown_sender' and created_at >= ${dayStart} order by created_at limit 30`,
      [e.timezone],
    ),
    db.query<{ stage: string; n: number }>("select stage, count(*)::int as n from candidates group by stage"),
    db.query<{ model: string; requests: number }>("select model, requests from ai_usage where date = $1::date order by requests desc", [date]),
  ]);

  return {
    date,
    draftsWaiting: drafts[0]?.n ?? 0,
    needsReview: review.map((r) => ({ candidate: r.candidate, type: r.type, reason: r.issues[0]?.message ?? "Needs a look" })),
    linkMissing: missing,
    replies,
    sentToday: sent[0]?.n ?? 0,
    dailyLimit: settings.daily_send_limit,
    failures,
    unknownSenders: unknown,
    stageCounts: Object.fromEntries(stages.map((s) => [s.stage, s.n])),
    ai: { requests: ai.reduce((a, r) => a + r.requests, 0), limit: e.aiDailyLimit, byModel: ai },
  };
}

function section(title: string, lines: string[], empty: string): string {
  return `**${title}**\n\n${lines.length ? lines.map((l) => `- ${l}`).join("\n") : empty}`;
}

/** Plain paragraphs + bullets, rendered into the digest email template. */
export function digestBody(d: DigestData, appUrl: string): { subject: string; body: string } {
  const toApprove = d.draftsWaiting + d.needsReview.length;
  const subject = `Recruiting summary for ${d.date}: ${d.draftsWaiting} to approve, ${d.needsReview.length} to review, ${d.replies.length} replies`;
  const parts = [
    `Here is today's summary.${toApprove ? ` ${toApprove} email${toApprove === 1 ? " is" : "s are"} waiting for you in the Outbox: ${appUrl}/outbox` : " Nothing is waiting for you."}`,
    section(
      "Waiting for you",
      [
        `Drafts to approve: ${d.draftsWaiting}`,
        `Need review: ${d.needsReview.length}`,
        `Interview link missing: ${d.linkMissing.length}`,
      ],
      "",
    ),
    section("Needs review (and why)", d.needsReview.map((r) => `${r.candidate} (${EMAIL_TYPE_LABELS[r.type]}): ${r.reason}`), "None."),
    section("Interview link missing", d.linkMissing.map((r) => `${r.candidate}${r.job ? ` (${r.job})` : ""}`), "None."),
    section("Replies received today", d.replies.map((r) => `${r.candidate}: ${r.category.replace(/_/g, " ")}${r.subject ? ` - "${r.subject}"` : ""}`), "None."),
    section("Emails", [`Sent today: ${d.sentToday} of ${d.dailyLimit}`, `Failed today: ${d.failures.length}`], ""),
    ...(d.failures.length ? [section("Failures", d.failures.map((f) => `${f.candidate} (${EMAIL_TYPE_LABELS[f.type]}): ${f.error ?? "unknown error"}`), "")] : []),
    section("Emails from unknown senders", d.unknownSenders.map((u) => `${u.from ?? "unknown"}: ${u.subject ?? "(no subject)"}`), "None."),
    section(
      "Candidates by stage",
      STAGES.filter((s) => d.stageCounts[s]).map((s) => `${STAGE_LABELS[s]}: ${d.stageCounts[s]}`),
      "No candidates yet.",
    ),
    section(
      "AI usage today",
      [`${d.ai.requests} of ${d.ai.limit} requests`, ...d.ai.byModel.map((m) => `${m.model}: ${m.requests}`)],
      "",
    ),
  ];
  return { subject, body: parts.join("\n\n") };
}

export type DigestResult = { sent: boolean; to: string | null; reason?: string; subject: string; data: DigestData };

/**
 * Builds and emails the daily digest to HR. Safe to re-run: only one digest per
 * day is sent unless force=true.
 */
export async function runDailyDigest(opts: { force?: boolean } = {}): Promise<DigestResult> {
  const db = await getDb();
  const e = env();
  const settings = await getSettings();
  const data = await collectDigest();
  const { subject, body } = digestBody(data, e.appUrl);
  const to = settings.hr_digest_email || settings.sender_email || null;

  const already = await db.query(
    "select 1 from mail_log where kind = 'digest' and created_at >= (date_trunc('day', now() at time zone $1) at time zone $1) limit 1",
    [e.timezone],
  );
  if (already.length && !opts.force) return { sent: false, to, reason: "already sent today", subject, data };
  if (!to) {
    await logActivity({ actor: "cron", action: "digest.skipped", details: { reason: "No digest email set in Settings" } });
    return { sent: false, to, reason: "no digest email set in Settings", subject, data };
  }

  const template = await resolveTemplate("digest", null);
  const rendered = renderEmail(
    template,
    // The digest goes to HR, so no unsubscribe line.
    { ...buildTemplateData({ settings, job: null, candidate: { name: settings.sender_name || "HR" }, subject, body, interviewLink: null }), unsubscribe_text: "" },
  );
  const { html, text } = rendered;
  await sendMail({
    to: { email: to },
    from: { email: settings.sender_email || "hr@example.com", name: `${settings.company_name} recruiting app` },
    subject: rendered.subject,
    html,
    text,
    kind: "digest",
  });
  await logActivity({
    actor: "cron",
    action: "digest.sent",
    details: { to, drafts: data.draftsWaiting, needs_review: data.needsReview.length, replies: data.replies.length, sent: data.sentToday, ai: data.ai.requests },
  });
  return { sent: true, to, subject, data };
}
