import { logActivity } from "@/lib/activity";
import { aiBudgetLeft } from "@/lib/ai/usage";
import { getSettings } from "@/lib/data/settings";
import { getDb } from "@/lib/db/client";
import { createDraft, type CreateDraftResult } from "@/lib/drafting/create-draft";
import { loadJob } from "@/lib/drafting/prepare";
import { processPendingInbound } from "@/lib/inbound/handle";
import { resolveInterviewLink } from "@/lib/links/resolve";
import { sendApproved, type SendSummary } from "@/lib/sender/send";
import type { Candidate, EmailType } from "@/lib/types";

/** A draft can take up to 4 AI requests (write, check, rewrite, re-check). */
const AI_COST_PER_DRAFT = 4;

export type RunOptions = { deadline?: number };

export type RunSummary = {
  done: boolean;
  drafted: number;
  linkMissing: number;
  skipped: number;
  stoppedBecause?: "time" | "ai_limit";
  details: Record<string, number>;
};

function emptySummary(): RunSummary {
  return { done: true, drafted: 0, linkMissing: 0, skipped: 0, details: {} };
}

// Candidates whose job is open, who can be emailed, and are not suppressed.
const ELIGIBLE = `
  c.do_not_email = false
  and exists (select 1 from jobs j where j.id = c.job_id and j.status = 'open')
  and not exists (select 1 from suppression s where s.email = c.email)`;

// No open draft of this type, and HR has not rejected this kind of email for this candidate.
// (HR rejections have no error text; system cancellations always have one.)
const NO_OPEN = (type: EmailType, rejectedSince = "'-infinity'::timestamptz") => `
  not exists (select 1 from outbox o where o.candidate_id = c.id and o.type = '${type}'
              and o.status in ('draft', 'needs_review', 'link_missing', 'approved', 'sending'))
  and not exists (select 1 from outbox o where o.candidate_id = c.id and o.type = '${type}'
              and o.status = 'rejected' and o.error is null and o.created_at > ${rejectedSince})`;

async function draftMany(
  ids: string[],
  type: EmailType,
  summary: RunSummary,
  opts: RunOptions,
): Promise<void> {
  for (const id of ids) {
    if (opts.deadline && Date.now() > opts.deadline) {
      summary.done = false;
      summary.stoppedBecause = "time";
      return;
    }
    if ((await aiBudgetLeft()) < AI_COST_PER_DRAFT) {
      summary.done = true; // nothing more can be done today
      summary.stoppedBecause = "ai_limit";
      return;
    }
    const res: CreateDraftResult = await createDraft({ candidateId: id, type, actor: "cron" });
    if (res.outcome === "created") summary.drafted++;
    else if (res.outcome === "link_missing") summary.linkMissing++;
    else summary.skipped++;
    summary.details[type] = (summary.details[type] ?? 0) + 1;
  }
}

/** new -> first outreach email, up to the batch size per day. */
export async function runOutreach(opts: RunOptions = {}): Promise<RunSummary> {
  const db = await getDb();
  const settings = await getSettings();
  const summary = emptySummary();
  // Today's batch: drafts already created today count towards the batch size.
  const today = await db.query<{ n: number }>(
    "select count(*)::int as n from outbox where type = 'outreach' and created_at >= now() - interval '20 hours'",
  );
  const remaining = Math.max(0, settings.outreach_batch_size - (today[0]?.n ?? 0));
  if (remaining === 0) return summary;
  const rows = await db.query<{ id: string }>(
    `select c.id from candidates c where c.stage = 'new' and ${ELIGIBLE} and ${NO_OPEN("outreach")}
     order by c.created_at limit $1`,
    [remaining],
  );
  await draftMany(rows.map((r) => r.id), "outreach", summary, opts);
  await logActivity({ actor: "cron", action: "automation.outreach", details: { ...summary } });
  return summary;
}

/**
 * Hourly during working hours:
 *  - process replies that are still waiting for classification
 *  - interested -> interview invite (link-missing candidates retried once a link exists)
 *  - contacted / interview_invited with no reply after followup_days -> follow-up (max_followups)
 *  - interviewed with HR notes -> feedback email
 *  - finally, send approved emails (saves GitHub Actions minutes)
 */
export async function runStageEmails(opts: RunOptions = {}): Promise<RunSummary & { send?: SendSummary; repliesProcessed: number }> {
  const db = await getDb();
  const settings = await getSettings();
  const summary = { ...emptySummary(), repliesProcessed: 0 } as RunSummary & { send?: SendSummary; repliesProcessed: number };

  summary.repliesProcessed = await processPendingInbound(10);

  // Link missing: retry candidates whose link has since been added.
  const missing = await db.query<Candidate>(`select c.* from candidates c where c.stage = 'link_missing' and ${ELIGIBLE}`);
  for (const c of missing) {
    const job = await loadJob(c.job_id);
    if (resolveInterviewLink({ candidateOverride: c.interview_link_override, jobLink: job?.interview_link, defaultLink: settings.default_interview_link })) {
      await db.query("delete from outbox where candidate_id = $1 and type = 'interview_invite' and status = 'link_missing'", [c.id]);
      await db.query("update candidates set stage = 'interested' where id = $1 and stage = 'link_missing'", [c.id]);
    }
  }

  const invites = await db.query<{ id: string }>(
    `select c.id from candidates c where c.stage = 'interested' and ${ELIGIBLE}
       and ${NO_OPEN("interview_invite", "coalesce(c.last_reply_at, '-infinity'::timestamptz)")}
     order by c.updated_at limit 50`,
  );
  await draftMany(invites.map((r) => r.id), "interview_invite", summary, opts);

  if (summary.done) {
    const followups = await db.query<{ id: string }>(
      `select c.id from candidates c
       where c.stage in ('contacted', 'interview_invited') and ${ELIGIBLE}
         and c.followup_count < $1
         and c.last_contacted_at is not null
         and c.last_contacted_at < now() - make_interval(days => $2)
         and (c.last_reply_at is null or c.last_reply_at < c.last_contacted_at)
         and ${NO_OPEN("followup", "c.last_contacted_at")}
       order by c.last_contacted_at limit 50`,
      [settings.max_followups, settings.followup_days],
    );
    await draftMany(followups.map((r) => r.id), "followup", summary, opts);
  }

  if (summary.done) {
    const feedback = await db.query<{ id: string }>(
      `select c.id from candidates c
       where c.stage = 'interviewed' and coalesce(trim(c.hr_notes), '') <> '' and ${ELIGIBLE} and ${NO_OPEN("feedback")}
       order by c.updated_at limit 50`,
    );
    await draftMany(feedback.map((r) => r.id), "feedback", summary, opts);
  }

  summary.send = await sendApproved({ actor: "cron" });
  await logActivity({ actor: "cron", action: "automation.stage_emails", details: { ...summary, send: undefined, sent: summary.send.sent } });
  return summary;
}
