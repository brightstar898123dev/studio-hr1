"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createJob, deleteJob, updateJob } from "@/lib/data/jobs";
import { fieldErrors, JobSchema, type ActionResult } from "@/lib/validation";

function parse(form: FormData) {
  return JobSchema.safeParse(Object.fromEntries(form.entries()));
}

export async function createJobAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = parse(form);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const job = await createJob(parsed.data);
  await logActivity({ actor: "hr", action: "job.created", entity: "job", entityId: job.id, details: { title: job.title } });
  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

export async function updateJobAction(id: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = parse(form);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const job = await updateJob(id, parsed.data);
  if (!job) return { ok: false, error: "This job no longer exists." };
  await logActivity({ actor: "hr", action: "job.updated", entity: "job", entityId: id, details: { title: job.title } });
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  return { ok: true, message: "Job saved." };
}

export async function deleteJobAction(id: string): Promise<void> {
  await requireUser();
  await deleteJob(id);
  await logActivity({ actor: "hr", action: "job.deleted", entity: "job", entityId: id });
  revalidatePath("/jobs");
  redirect("/jobs");
}
