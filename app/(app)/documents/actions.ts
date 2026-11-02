"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { AiError } from "@/lib/ai/types";
import { deleteDocument, getDocument, insertDocument, updateDocument } from "@/lib/data/documents";
import { updateJob } from "@/lib/data/jobs";
import { generateDocument } from "@/lib/documents/generate";
import type { ActionResult } from "@/lib/validation";

function aiMessage(err: unknown): string {
  return err instanceof AiError ? err.message : `Something went wrong: ${err instanceof Error ? err.message : String(err)}`;
}

export async function createDocumentAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireUser();
  const type = form.get("type") === "feedback" ? "feedback" : "jd";
  const notes = String(form.get("notes") ?? "").trim();
  const jobId = String(form.get("job_id") ?? "") || null;
  const candidateId = String(form.get("candidate_id") ?? "") || null;
  if (notes.length < 10) return { ok: false, error: "Write a few notes first (at least a sentence).", fieldErrors: { notes: "Please add some notes." } };
  if (notes.length > 10_000) return { ok: false, error: "Notes are too long (max 10,000 characters)." };
  if (type === "feedback" && !candidateId) return { ok: false, error: "Choose the candidate this feedback is about.", fieldErrors: { candidate_id: "Choose a candidate." } };
  let draft;
  try {
    draft = await generateDocument({ type, notes, jobId, candidateId });
  } catch (err) {
    return { ok: false, error: aiMessage(err) };
  }
  const doc = await insertDocument({ type, title: draft.title, job_id: jobId, candidate_id: candidateId, notes, content: draft.content });
  await logActivity({ actor: "hr", action: "document.created", entity: "document", entityId: doc.id, details: { type } });
  revalidatePath("/documents");
  redirect(`/documents/${doc.id}`);
}

export async function saveDocumentAction(id: string, input: { title: string; content: string; status: string }): Promise<ActionResult> {
  await requireUser();
  if (input.content.length > 100_000) return { ok: false, error: "The document is too long." };
  await updateDocument(id, {
    title: input.title.trim().slice(0, 300),
    content: input.content,
    status: input.status === "final" ? "final" : "draft",
  });
  await logActivity({ actor: "hr", action: "document.saved", entity: "document", entityId: id });
  revalidatePath("/documents");
  revalidatePath(`/documents/${id}`);
  return { ok: true, message: "Document saved." };
}

export async function regenerateDocumentAction(id: string): Promise<ActionResult<{ title: string; content: string }>> {
  await requireUser();
  const doc = await getDocument(id);
  if (!doc) return { ok: false, error: "This document no longer exists." };
  try {
    const draft = await generateDocument({ type: doc.type, notes: doc.notes, jobId: doc.job_id, candidateId: doc.candidate_id });
    await logActivity({ actor: "hr", action: "document.regenerated", entity: "document", entityId: id });
    return { ok: true, message: "New draft written. Save to keep it.", data: draft };
  } catch (err) {
    return { ok: false, error: aiMessage(err) };
  }
}

/** Copies a JD document into a job's job description. */
export async function applyAsJobJdAction(id: string, jobId: string, content: string): Promise<ActionResult> {
  await requireUser();
  const doc = await getDocument(id);
  if (!doc || doc.type !== "jd") return { ok: false, error: "Only job description documents can be used as a JD." };
  if (!jobId) return { ok: false, error: "Choose a job first." };
  const job = await updateJob(jobId, { jd: content });
  if (!job) return { ok: false, error: "That job no longer exists." };
  await updateDocument(id, { content, job_id: jobId, status: "final" });
  await logActivity({ actor: "hr", action: "document.used_as_jd", entity: "job", entityId: jobId, details: { document_id: id } });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/documents/${id}`);
  return { ok: true, message: `Saved as the job description of "${job.title}".` };
}

export async function deleteDocumentAction(id: string): Promise<void> {
  await requireUser();
  await deleteDocument(id);
  await logActivity({ actor: "hr", action: "document.deleted", entity: "document", entityId: id });
  revalidatePath("/documents");
  redirect("/documents");
}
