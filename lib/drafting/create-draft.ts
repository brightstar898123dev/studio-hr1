import { logActivity, type Actor } from "@/lib/activity";
import { aiJson } from "@/lib/ai/client";
import { EmailDraftSchema } from "@/lib/ai/schemas";
import { draftWithChecks } from "@/lib/checker/flow";
import { getCandidate } from "@/lib/data/candidates";
import { getSettings } from "@/lib/data/settings";
import { getDb } from "@/lib/db/client";
import { firstName } from "@/lib/email/placeholders";
import { PROMPT_DEFINITIONS } from "@/lib/prompts/defaults";
import { buildEmailMessages, buildRewriteMessages } from "@/lib/prompts/resolve";
import { shouldAutoApprove } from "@/lib/sender/auto-send";
import { FROZEN_STAGES, type EmailType, type OutboxStatus, type ReplyCategory } from "@/lib/types";
import { loadJob, prepareDraft } from "./prepare";

export { emailNeedsLink } from "./prepare";

export type CreateDraftInput = {
  candidateId: string;
  type: EmailType;
  actor: Actor;
  reply?: { messageId: string; category: ReplyCategory; subject: string | null; text: string };
  /** HR asked for this by hand: skip the "job must be open" check. */
  manual?: boolean;
};

export type CreateDraftResult =
  | { outcome: "created"; outboxId: string; status: OutboxStatus }
  | { outcome: "link_missing"; outboxId: string | null }
  | { outcome: "skipped"; reason: string };

const OPEN_STATUSES = ["draft", "needs_review", "link_missing", "approved", "sending"];

export async function createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
  const db = await getDb();
  const candidate = await getCandidate(input.candidateId);
  if (!candidate) return { outcome: "skipped", reason: "candidate not found" };
  if (candidate.do_not_email) return { outcome: "skipped", reason: "candidate is on the do-not-email list" };
  if (FROZEN_STAGES.includes(candidate.stage)) return { outcome: "skipped", reason: `candidate is ${candidate.stage}` };
  const suppressed = await db.query("select 1 from suppression where email = $1", [candidate.email]);
  if (suppressed.length) return { outcome: "skipped", reason: "email address is suppressed" };

  const job = await loadJob(candidate.job_id);
  if (!input.manual && job && job.status !== "open") return { outcome: "skipped", reason: `job is ${job.status}` };
  if (input.type !== "reply" && !job) return { outcome: "skipped", reason: "candidate has no job" };

  // Idempotency: one open draft per candidate per type.
  const open = await db.query<{ id: string }>(
    "select id from outbox where candidate_id = $1 and type = $2 and status = any($3::text[])",
    [candidate.id, input.type, OPEN_STATUSES],
  );
  if (open.length) {
    if (input.type !== "reply") return { outcome: "skipped", reason: "a draft of this type is already waiting" };
    // A newer reply replaces an older unsent reply draft.
    await db.query(
      "update outbox set status = 'rejected', error = 'Replaced by a reply to a newer message' where id = any($1::uuid[]) and status in ('draft', 'needs_review', 'approved')",
      [open.map((o) => o.id)],
    );
  }

  const settings = await getSettings();
  const env = await prepareDraft({ settings, job, candidate, type: input.type, reply: input.reply });

  if (input.type === "interview_invite" && !env.interviewLink) {
    // Never draft an invite without a link.
    const rows = await db.query<{ id: string }>(
      `insert into outbox (candidate_id, job_id, type, to_email, subject, body, status, checker_issues)
       values ($1, $2, 'interview_invite', $3, $4, '', 'link_missing', $5)
       on conflict do nothing returning id`,
      [
        candidate.id,
        job?.id ?? null,
        candidate.email,
        `Interview invite for ${candidate.name} is waiting for a link`,
        JSON.stringify([
          {
            rule: "link_missing",
            message: "No valid https:// interview link on the candidate, the job, or in Settings. Add one, then click Re-check.",
            source: "system",
          },
        ]),
      ],
    );
    await db.query("update candidates set stage = 'link_missing' where id = $1", [candidate.id]);
    await logActivity({ actor: input.actor, action: "draft.link_missing", entity: "candidate", entityId: candidate.id, details: { job_id: job?.id } });
    return { outcome: "link_missing", outboxId: rows[0]?.id ?? null };
  }

  const baseMessages = buildEmailMessages(env.instructions.text, env.context);
  const mockHints = {
    firstName: firstName(candidate.name),
    jobTitle: job?.title,
    companyName: settings.company_name,
    emailType: input.type,
    hasLink: !!env.interviewLink,
    decision: candidate.decision,
    category: input.reply?.category,
  };

  const result = await draftWithChecks({
    passMark: settings.checker_pass_mark,
    generate: async (feedback) => {
      const messages = feedback ? buildRewriteMessages(baseMessages, feedback.previous, feedback.issues) : baseMessages;
      const res = await aiJson({ kind: env.promptType, messages, mock: { ...mockHints, fixIssues: feedback?.issues } }, EmailDraftSchema);
      return res.data;
    },
    render: env.render,
    rules: env.rules,
    aiCheck: env.aiCheck,
  });

  const autoApprove = shouldAutoApprove({
    autoSend: settings.auto_send,
    status: result.status,
    passedBoth: result.passedBoth,
    replyCategory: input.reply?.category,
  });
  // Replies to unclear messages always need HR, even if the checker liked the draft.
  const status: OutboxStatus = autoApprove ? "approved" : input.reply?.category === "other" ? "needs_review" : result.status;
  const issues = [...result.issues];
  if (input.reply?.category === "other") {
    issues.push({ rule: "needs_hr", message: "The candidate's message was unclear, so this reply always waits for you.", source: "system" });
  }

  const rows = await db.query<{ id: string }>(
    `insert into outbox (candidate_id, job_id, type, to_email, subject, body, html, text, interview_link, reply_category, in_reply_to,
                         status, approved, approved_at, checker_score, checker_issues, rewrite_count)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     on conflict do nothing returning id`,
    [
      candidate.id,
      job?.id ?? null,
      input.type,
      candidate.email,
      result.rendered.subject || result.draft.subject,
      result.draft.body,
      result.rendered.html,
      result.rendered.text,
      env.interviewLink,
      input.reply?.category ?? null,
      input.reply?.messageId ?? null,
      status,
      autoApprove,
      autoApprove ? new Date().toISOString() : null,
      result.score,
      JSON.stringify(issues),
      result.rewriteCount,
    ],
  );
  const outboxId = rows[0]?.id;
  if (!outboxId) return { outcome: "skipped", reason: "a draft of this type was created at the same time" };

  await logActivity({
    actor: input.actor,
    action: autoApprove ? "draft.auto_approved" : status === "needs_review" ? "draft.needs_review" : "draft.created",
    entity: "outbox",
    entityId: outboxId,
    details: {
      candidate_id: candidate.id,
      type: input.type,
      prompt: PROMPT_DEFINITIONS[env.promptType].title,
      prompt_source: env.instructions.source,
      template: env.template.source,
      score: result.score,
      rewrites: result.rewriteCount,
      issues: issues.length,
    },
  });
  return { outcome: "created", outboxId, status };
}
