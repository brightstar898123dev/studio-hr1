import { logActivity } from "@/lib/activity";
import { getCandidate } from "@/lib/data/candidates";
import { getSettings } from "@/lib/data/settings";
import { getDb } from "@/lib/db/client";
import { createDraft } from "@/lib/drafting/create-draft";
import { loadJob, prepareDraft } from "@/lib/drafting/prepare";
import type { CheckerIssue, OutboxRow, ReplyCategory } from "@/lib/types";

export type OpResult = { ok: true; message: string } | { ok: false; error: string };

export async function getOutboxRow(id: string): Promise<OutboxRow | null> {
  const db = await getDb();
  return (await db.query<OutboxRow>("select * from outbox where id = $1", [id]))[0] ?? null;
}

/** HR approves drafts. Link-missing rows have no email yet and cannot be approved. */
export async function approve(ids: string[]): Promise<{ approved: number; skipped: number }> {
  const db = await getDb();
  const rows = await db.query<{ id: string }>(
    `update outbox set status = 'approved', approved = true, approved_at = now(), error = null
     where id = any($1::uuid[]) and status in ('draft', 'needs_review') and length(trim(body)) > 0
     returning id`,
    [ids],
  );
  for (const r of rows) await logActivity({ actor: "hr", action: "outbox.approved", entity: "outbox", entityId: r.id });
  return { approved: rows.length, skipped: ids.length - rows.length };
}

export async function reject(id: string): Promise<OpResult> {
  const db = await getDb();
  const rows = await db.query<{ id: string; candidate_id: string; type: string; status: string }>(
    `update outbox set status = 'rejected', approved = false, error = null
     where id = $1 and status in ('draft', 'needs_review', 'link_missing', 'approved', 'failed') returning id, candidate_id, type, status`,
    [id],
  );
  if (!rows.length) return { ok: false, error: "This email can no longer be rejected (it may already be sending or sent)." };
  await logActivity({ actor: "hr", action: "outbox.rejected", entity: "outbox", entityId: id });
  return { ok: true, message: "Email rejected. It will not be sent." };
}

/** Puts a failed email back in the queue. */
export async function retryFailed(id: string): Promise<OpResult> {
  const db = await getDb();
  const rows = await db.query("update outbox set status = 'approved', error = null where id = $1 and status = 'failed' returning id", [id]);
  if (!rows.length) return { ok: false, error: "Only failed emails can be retried." };
  await logActivity({ actor: "hr", action: "outbox.retry", entity: "outbox", entityId: id });
  return { ok: true, message: "Queued again. It will go out with the next send run." };
}

async function loadEnv(row: OutboxRow) {
  const candidate = await getCandidate(row.candidate_id);
  if (!candidate) return null;
  const [settings, job] = await Promise.all([getSettings(), loadJob(row.job_id)]);
  const db = await getDb();
  let reply: { subject: string | null; text: string; category: ReplyCategory } | undefined;
  if (row.type === "reply") {
    const msg = row.in_reply_to
      ? (await db.query<{ subject: string | null; body_text: string | null }>("select subject, body_text from messages where id = $1", [row.in_reply_to]))[0]
      : undefined;
    reply = { subject: msg?.subject ?? null, text: msg?.body_text ?? "", category: (row.reply_category ?? "other") as ReplyCategory };
  }
  return prepareDraft({ settings, job, candidate, type: row.type, reply, storedLink: row.interview_link });
}

/**
 * HR edits the subject/body. The email is re-rendered in its template and the
 * rule checks run straight away. Failing edits go to "needs_review".
 */
export async function editDraft(id: string, subject: string, body: string): Promise<OpResult & { issues?: CheckerIssue[] }> {
  const row = await getOutboxRow(id);
  if (!row) return { ok: false, error: "This email no longer exists." };
  if (!["draft", "needs_review", "approved", "failed"].includes(row.status)) {
    return { ok: false, error: "This email can no longer be edited." };
  }
  const envd = await loadEnv(row);
  if (!envd) return { ok: false, error: "The candidate no longer exists." };
  const draft = { subject: subject.trim(), body: body.trim() };
  const rendered = envd.render(draft);
  const finalSubject = draft.subject; // HR edits the final subject line directly
  const check = envd.rules({ subject: finalSubject, body: draft.body }, { ...rendered, subject: finalSubject });
  const nextStatus = check.passed ? (row.status === "failed" ? "draft" : row.status) : "needs_review";
  const db = await getDb();
  await db.query(
    `update outbox set subject = $2, body = $3, html = $4, text = $5, edited_by_hr = true, interview_link = $6,
       checker_issues = $7, checker_score = null, status = $8, approved = ($8 = 'approved'), error = null
     where id = $1`,
    [id, finalSubject, draft.body, rendered.html, rendered.text, envd.interviewLink, JSON.stringify(check.issues), nextStatus],
  );
  await logActivity({ actor: "hr", action: "outbox.edited", entity: "outbox", entityId: id, details: { passed: check.passed } });
  return check.passed
    ? { ok: true, message: "Saved. The checks passed. Click Re-check for a fresh AI score." }
    : { ok: true, message: "Saved, but some checks failed. See the issues below.", issues: check.issues };
}

/**
 * Re-check: re-renders with the current template and runs the rules and the AI check.
 * For "link missing" rows it drafts the invite again if a link now exists.
 */
export async function recheck(id: string): Promise<OpResult> {
  const row = await getOutboxRow(id);
  if (!row) return { ok: false, error: "This email no longer exists." };
  const db = await getDb();

  if (row.status === "link_missing") {
    const candidate = await getCandidate(row.candidate_id);
    if (!candidate) return { ok: false, error: "The candidate no longer exists." };
    const settings = await getSettings();
    const envd = await prepareDraft({ settings, job: await loadJob(row.job_id), candidate, type: "interview_invite" });
    if (!envd.interviewLink) {
      return { ok: false, error: "Still no interview link. Add a https:// link to the job or the candidate first." };
    }
    await db.query("delete from outbox where id = $1 and status = 'link_missing'", [id]);
    if (candidate.stage === "link_missing") await db.query("update candidates set stage = 'interested' where id = $1", [candidate.id]);
    const res = await createDraft({ candidateId: candidate.id, type: "interview_invite", actor: "hr", manual: true });
    return res.outcome === "created"
      ? { ok: true, message: res.status === "needs_review" ? "Invite drafted, but it needs review." : "Invite drafted with the link." }
      : { ok: false, error: res.outcome === "skipped" ? `Not drafted: ${res.reason}.` : "Still no interview link." };
  }

  if (!["draft", "needs_review", "approved", "failed"].includes(row.status)) {
    return { ok: false, error: "Only waiting emails can be re-checked." };
  }
  if (!row.body.trim()) return { ok: false, error: "There is no email text yet. Edit the email first." };
  const envd = await loadEnv(row);
  if (!envd) return { ok: false, error: "The candidate no longer exists." };
  const rendered = envd.render({ subject: row.subject, body: row.body });
  const subject = row.subject;
  const rules = envd.rules({ subject, body: row.body }, { ...rendered, subject });
  let score: number | null = null;
  const issues: CheckerIssue[] = [...rules.issues];
  if (rules.passed) {
    try {
      const ai = await envd.aiCheck({ subject, body: row.body });
      score = ai.score;
      issues.push(...ai.issues.map((m) => ({ rule: "ai_check", message: m, source: "ai" as const })));
    } catch (err) {
      issues.push({ rule: "ai_check_failed", message: `The AI checker could not run: ${err instanceof Error ? err.message : String(err)}`, source: "system" });
    }
  }
  const passed = rules.passed && score !== null && score >= envd.settings.checker_pass_mark;
  if (row.type === "reply" && row.reply_category === "other") {
    issues.push({ rule: "needs_hr", message: "The candidate's message was unclear, so this reply always waits for you.", source: "system" });
  }
  const status = row.status === "approved" && passed ? "approved" : passed && row.reply_category !== "other" ? "draft" : "needs_review";
  await db.query(
    `update outbox set html = $2, text = $3, interview_link = $4, checker_score = $5, checker_issues = $6, status = $7,
       approved = ($7 = 'approved'), error = null where id = $1`,
    [id, rendered.html, rendered.text, envd.interviewLink, score, JSON.stringify(issues), status],
  );
  await logActivity({ actor: "hr", action: "outbox.rechecked", entity: "outbox", entityId: id, details: { score, passed } });
  return { ok: true, message: passed ? `Checks passed (score ${score}/10).` : "Re-checked. Some issues need your attention." };
}
