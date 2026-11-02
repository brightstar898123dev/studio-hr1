"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getDb } from "@/lib/db/client";
import {
  createCandidate,
  deleteCandidate,
  DuplicateEmailError,
  getCandidate,
  importCandidates,
  setCandidateStage,
  updateCandidate,
  type ImportResult,
  type ImportRow,
} from "@/lib/data/candidates";
import { STAGES, type Stage } from "@/lib/types";
import { CandidateSchema, fieldErrors, type ActionResult } from "@/lib/validation";

function revalidate(id?: string) {
  revalidatePath("/candidates");
  if (id) revalidatePath(`/candidates/${id}`);
  revalidatePath("/");
}

export async function createCandidateAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = CandidateSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const c = await createCandidate(parsed.data);
    await logActivity({ actor: "hr", action: "candidate.created", entity: "candidate", entityId: c.id, details: { name: c.name } });
  } catch (err) {
    if (err instanceof DuplicateEmailError) return { ok: false, error: err.message, fieldErrors: { email: err.message } };
    throw err;
  }
  revalidate();
  return { ok: true, message: "Candidate added." };
}

export async function updateCandidateAction(id: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = CandidateSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const before = await getCandidate(id);
  if (!before) return { ok: false, error: "This candidate no longer exists." };
  try {
    await updateCandidate(id, parsed.data);
  } catch (err) {
    if (err instanceof DuplicateEmailError) return { ok: false, error: err.message, fieldErrors: { email: err.message } };
    throw err;
  }
  await logActivity({
    actor: "hr",
    action: "candidate.updated",
    entity: "candidate",
    entityId: id,
    details: before.stage !== parsed.data.stage ? { from: before.stage, to: parsed.data.stage } : {},
  });
  revalidate(id);
  return { ok: true, message: "Candidate saved." };
}

export async function moveCandidateAction(id: string, stage: string): Promise<ActionResult> {
  await requireUser();
  if (!(STAGES as readonly string[]).includes(stage)) return { ok: false, error: "Unknown stage." };
  const before = await getCandidate(id);
  if (!before) return { ok: false, error: "This candidate no longer exists." };
  await setCandidateStage(id, stage as Stage);
  await logActivity({ actor: "hr", action: "candidate.stage_changed", entity: "candidate", entityId: id, details: { from: before.stage, to: stage } });
  revalidate(id);
  return { ok: true, message: `${before.name} moved.` };
}

export async function doNotEmailAction(id: string, on: boolean): Promise<ActionResult> {
  await requireUser();
  const c = await getCandidate(id);
  if (!c) return { ok: false, error: "This candidate no longer exists." };
  const db = await getDb();
  await updateCandidate(id, { do_not_email: on });
  if (on) {
    await db.query(
      "insert into suppression (email, reason, details) values ($1, 'manual', 'Added by HR') on conflict (email) do nothing",
      [c.email],
    );
    // Stop anything that was waiting to go out.
    await db.query(
      "update outbox set status = 'rejected', error = 'Candidate is on the do-not-email list' where candidate_id = $1 and status in ('draft', 'needs_review', 'link_missing', 'approved')",
      [id],
    );
  } else {
    await db.query("delete from suppression where email = $1 and reason = 'manual'", [c.email]);
  }
  await logActivity({ actor: "hr", action: on ? "candidate.do_not_email_on" : "candidate.do_not_email_off", entity: "candidate", entityId: id });
  revalidate(id);
  return { ok: true, message: on ? "Added to the do-not-email list." : "Removed from the do-not-email list." };
}

export async function deleteCandidateAction(id: string): Promise<void> {
  await requireUser();
  await deleteCandidate(id);
  await logActivity({ actor: "hr", action: "candidate.deleted", entity: "candidate", entityId: id });
  revalidate();
  redirect("/candidates");
}

export async function importCandidatesAction(rows: ImportRow[], jobId: string | null): Promise<ImportResult> {
  await requireUser();
  const safeRows = rows.slice(0, 5000);
  const result = await importCandidates(safeRows, jobId || null);
  await logActivity({
    actor: "hr",
    action: "candidate.imported",
    entity: "candidate",
    details: { created: result.created, duplicates: result.duplicates.length, invalid: result.invalid.length, job_id: jobId },
  });
  revalidate();
  return result;
}

export async function pauseCandidateAction(id: string, pause: boolean): Promise<ActionResult> {
  await requireUser();
  const c = await getCandidate(id);
  if (!c) return { ok: false, error: "This candidate no longer exists." };
  const db = await getDb();
  let to: Stage = "paused";
  if (!pause) {
    const last = await db.query<{ details: { from?: string } }>(
      "select details from activity_log where entity_id = $1 and action = 'candidate.paused' order by created_at desc limit 1",
      [id],
    );
    const from = last[0]?.details?.from;
    to = from && (STAGES as readonly string[]).includes(from) && from !== "paused" ? (from as Stage) : c.last_contacted_at ? "contacted" : "new";
  }
  await setCandidateStage(id, to);
  await logActivity({
    actor: "hr",
    action: pause ? "candidate.paused" : "candidate.resumed",
    entity: "candidate",
    entityId: id,
    details: { from: c.stage, to },
  });
  revalidate(id);
  return { ok: true, message: pause ? "Paused. Automation will skip this candidate." : "Resumed." };
}

export async function draftNowAction(id: string, type: string): Promise<ActionResult> {
  await requireUser();
  const allowed = ["outreach", "interview_invite", "followup", "feedback"] as const;
  if (!(allowed as readonly string[]).includes(type)) return { ok: false, error: "Choose an email type." };
  const { createDraft } = await import("@/lib/drafting/create-draft");
  const res = await createDraft({ candidateId: id, type: type as (typeof allowed)[number], actor: "hr", manual: true });
  revalidate(id);
  revalidatePath("/outbox");
  if (res.outcome === "created") {
    return { ok: true, message: res.status === "needs_review" ? "Drafted, but it needs your review. See the Outbox." : "Drafted. See the Outbox to approve it." };
  }
  if (res.outcome === "link_missing") return { ok: false, error: "No interview link is set for this candidate or job. Add one first." };
  return { ok: false, error: `Not drafted: ${res.reason}.` };
}
