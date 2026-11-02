import { logActivity } from "@/lib/activity";
import { aiJson } from "@/lib/ai/client";
import { ClassificationSchema, type Classification } from "@/lib/ai/schemas";
import { findCandidateByEmail, findCandidateByReplyToken } from "@/lib/data/candidates";
import { getPromptOverrides } from "@/lib/data/prompts";
import { getSettings } from "@/lib/data/settings";
import { getDb } from "@/lib/db/client";
import { createDraft } from "@/lib/drafting/create-draft";
import { loadJob } from "@/lib/drafting/prepare";
import { buildClassifyMessages, buildContext, resolveInstructions, stripQuoted, type HistoryItem } from "@/lib/prompts/resolve";
import { FROZEN_STAGES, type Candidate, type ReplyCategory, type Stage } from "@/lib/types";
import { emailsIn, isAutoReply, isBounce, isUnsubscribe } from "./detect";
import type { InboundEmail } from "./parse";

export type IngestResult =
  | { kind: "duplicate" }
  | { kind: "unknown_sender"; messageId: string }
  | { kind: "bounce" | "auto_reply" | "unsubscribe"; messageId: string | null; candidateId: string | null }
  | { kind: "pending"; messageId: string; candidateId: string };

/** Stage each reply category moves the candidate to. */
export const STAGE_FOR_CATEGORY: Record<ReplyCategory, Stage> = {
  interested: "interested",
  not_interested: "not_interested",
  question: "question_pending",
  reschedule: "reschedule_requested",
  other: "needs_hr",
};

async function cancelOpenDrafts(candidateId: string, why: string) {
  const db = await getDb();
  await db.query(
    "update outbox set status = 'rejected', approved = false, error = $2 where candidate_id = $1 and status in ('draft', 'needs_review', 'link_missing', 'approved')",
    [candidateId, why],
  );
}

async function suppress(email: string, reason: "bounce" | "unsubscribe", details: string) {
  const db = await getDb();
  await db.query("insert into suppression (email, reason, details) values ($1, $2, $3) on conflict (email) do nothing", [email, reason, details]);
}

/** Finds the candidate: sender email first, then the reply token in the To address. */
async function matchCandidate(e: InboundEmail, replyDomain: string): Promise<Candidate | null> {
  const bySender = await findCandidateByEmail(e.from.email);
  if (bySender) return bySender;
  for (const to of e.to) {
    const [local, domain] = to.split("@");
    if (!local || !domain) continue;
    if (replyDomain && domain.toLowerCase() !== replyDomain.toLowerCase()) continue;
    if (/^[a-f0-9]{16}$/i.test(local)) {
      const c = await findCandidateByReplyToken(local);
      if (c) return c;
    }
  }
  return null;
}

/**
 * Step 1 (fast, inside the webhook request): store the email once, match the
 * candidate, and handle bounces, auto-replies and unsubscribes. Normal replies
 * are left "pending" for classification.
 */
export async function ingestInbound(e: InboundEmail): Promise<IngestResult> {
  const db = await getDb();
  const settings = await getSettings();
  const replyDomain = settings.reply_domain || process.env.REPLY_DOMAIN || "";

  const exists = await db.query("select 1 from messages where external_id = $1", [e.externalId]);
  if (exists.length) return { kind: "duplicate" };

  const insert = async (candidateId: string | null, category: string | null) => {
    const rows = await db.query<{ id: string }>(
      `insert into messages (candidate_id, direction, from_email, to_email, subject, body_text, body_html, category, external_id, raw)
       values ($1, 'in', $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing returning id`,
      [candidateId, e.from.email, e.to.join(", ") || null, e.subject, e.text, e.html, category, e.externalId, JSON.stringify(e.raw ?? null)],
    );
    return rows[0]?.id ?? null;
  };

  // Bounce: find who it was about, suppress them.
  if (isBounce(e)) {
    let candidate: Candidate | null = null;
    for (const addr of emailsIn(`${e.text}\n${e.subject}`)) {
      if (addr === e.from.email || (replyDomain && addr.endsWith(`@${replyDomain}`))) continue;
      candidate = await findCandidateByEmail(addr);
      if (candidate) break;
    }
    if (!candidate) candidate = await matchCandidate({ ...e, from: { email: "", name: null } }, replyDomain);
    const messageId = await insert(candidate?.id ?? null, "bounce");
    if (candidate) {
      await suppress(candidate.email, "bounce", e.subject.slice(0, 200));
      await cancelOpenDrafts(candidate.id, "The candidate's email address bounced.");
    }
    await logActivity({ actor: "webhook", action: "inbound.bounce", entity: "candidate", entityId: candidate?.id, details: { subject: e.subject } });
    return { kind: "bounce", messageId, candidateId: candidate?.id ?? null };
  }

  const candidate = await matchCandidate(e, replyDomain);
  if (!candidate) {
    const messageId = await insert(null, "unknown_sender");
    await logActivity({
      actor: "webhook",
      action: "inbound.unknown_sender",
      entity: "message",
      entityId: messageId,
      details: { from: e.from.email, subject: e.subject, snippet: stripQuoted(e.text).slice(0, 200) },
    });
    return { kind: "unknown_sender", messageId: messageId ?? "" };
  }

  if (isAutoReply(e)) {
    const messageId = await insert(candidate.id, "auto_reply");
    await logActivity({ actor: "webhook", action: "inbound.auto_reply", entity: "candidate", entityId: candidate.id, details: { subject: e.subject } });
    return { kind: "auto_reply", messageId, candidateId: candidate.id };
  }

  if (isUnsubscribe(e)) {
    const messageId = await insert(candidate.id, "unsubscribe");
    await suppress(candidate.email, "unsubscribe", "Candidate asked to stop emails");
    await db.query("update candidates set do_not_email = true, last_reply_at = now() where id = $1", [candidate.id]);
    if (!FROZEN_STAGES.includes(candidate.stage)) await db.query("update candidates set stage = 'not_interested' where id = $1", [candidate.id]);
    await cancelOpenDrafts(candidate.id, "The candidate asked to stop emails.");
    await logActivity({ actor: "webhook", action: "inbound.unsubscribe", entity: "candidate", entityId: candidate.id });
    return { kind: "unsubscribe", messageId, candidateId: candidate.id };
  }

  const messageId = await insert(candidate.id, null);
  if (!messageId) return { kind: "duplicate" };
  await db.query("update candidates set last_reply_at = now() where id = $1", [candidate.id]);
  await logActivity({ actor: "webhook", action: "inbound.received", entity: "candidate", entityId: candidate.id, details: { subject: e.subject } });
  return { kind: "pending", messageId, candidateId: candidate.id };
}

/**
 * Step 2: classify a pending reply with the AI, move the candidate's stage, and
 * draft the right reply (through the checker) into the Outbox.
 * "interested" also drafts the interview invite. "other" always goes to Needs HR.
 */
export async function processInboundMessage(messageId: string): Promise<{ category: ReplyCategory | null; drafted: string[] }> {
  const db = await getDb();
  // Claim the message so two runs never process it twice.
  const claimed = await db.query<{ id: string; candidate_id: string; subject: string | null; body_text: string | null }>(
    "update messages set category = 'processing' where id = $1 and category is null and direction = 'in' and candidate_id is not null returning id, candidate_id, subject, body_text",
    [messageId],
  );
  const msg = claimed[0];
  if (!msg) return { category: null, drafted: [] };
  const candidate = (await db.query<Candidate>("select * from candidates where id = $1", [msg.candidate_id]))[0];
  if (!candidate) return { category: null, drafted: [] };

  const text = msg.body_text ?? "";
  let classification: Classification;
  try {
    const settings = await getSettings();
    const job = await loadJob(candidate.job_id);
    const history = await db.query<HistoryItem>(
      "select direction, subject, body_text, created_at from (select * from messages where candidate_id = $1 and id <> $2 order by created_at desc limit 6) m order by created_at asc",
      [candidate.id, msg.id],
    );
    const context = buildContext({ settings, job, candidate, history, latestReply: { subject: msg.subject, text } });
    const instructions = resolveInstructions("classify_reply", job, await getPromptOverrides());
    const res = await aiJson(
      { kind: "classify_reply", messages: buildClassifyMessages(instructions.text, context), mock: { replyText: stripQuoted(text) }, temperature: 0 },
      ClassificationSchema,
    );
    classification = res.data;
  } catch (err) {
    classification = { category: "other", confidence: 0, summary: `Could not classify automatically: ${err instanceof Error ? err.message : String(err)}` };
  }

  const category = classification.category;
  await db.query("update messages set category = $2 where id = $1", [msg.id, category]);
  const frozen = FROZEN_STAGES.includes(candidate.stage);
  if (!frozen) await db.query("update candidates set stage = $2 where id = $1", [candidate.id, STAGE_FOR_CATEGORY[category]]);
  await logActivity({
    actor: "webhook",
    action: "inbound.classified",
    entity: "candidate",
    entityId: candidate.id,
    details: { category, confidence: classification.confidence, summary: classification.summary, message_id: msg.id },
  });

  const drafted: string[] = [];
  if (frozen) return { category, drafted };

  // The candidate replied, so any waiting follow-up is no longer needed.
  await db.query(
    "update outbox set status = 'rejected', error = 'The candidate replied' where candidate_id = $1 and type = 'followup' and status in ('draft', 'needs_review', 'approved')",
    [candidate.id],
  );

  const reply = { messageId: msg.id, category, subject: msg.subject, text };
  if (category === "interested") {
    // The invite itself thanks them; a separate reply is only drafted if they also asked something.
    const invite = await createDraft({ candidateId: candidate.id, type: "interview_invite", actor: "webhook" });
    if (invite.outcome !== "skipped") drafted.push("interview_invite");
    if (/\?/.test(stripQuoted(text))) {
      const r = await createDraft({ candidateId: candidate.id, type: "reply", actor: "webhook", reply });
      if (r.outcome === "created") drafted.push("reply");
    }
  } else {
    const r = await createDraft({ candidateId: candidate.id, type: "reply", actor: "webhook", reply });
    if (r.outcome === "created") drafted.push("reply");
  }
  return { category, drafted };
}

/** Safety net: processes replies that were stored but not classified yet (e.g. the server stopped mid-way). */
export async function processPendingInbound(limit = 10): Promise<number> {
  const db = await getDb();
  // Messages stuck in "processing" for over 10 minutes go back to the queue.
  await db.query("update messages set category = null where category = 'processing' and created_at < now() - interval '10 minutes'");
  const rows = await db.query<{ id: string }>(
    "select id from messages where direction = 'in' and category is null and candidate_id is not null order by created_at limit $1",
    [limit],
  );
  let n = 0;
  for (const r of rows) {
    const res = await processInboundMessage(r.id);
    if (res.category) n++;
  }
  return n;
}
