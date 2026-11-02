"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { deleteTemplate, getTemplate, saveTemplate } from "@/lib/data/templates";
import { validateTemplate } from "@/lib/email/validate";
import { TEMPLATE_TYPES, type TemplateType } from "@/lib/types";
import type { ActionResult } from "@/lib/validation";

export type SaveTemplateInput = {
  type: string;
  job_id: string | null;
  name: string;
  format: string;
  subject_template: string;
  body_template: string;
};

export async function saveTemplateAction(input: SaveTemplateInput): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  if (!(TEMPLATE_TYPES as readonly string[]).includes(input.type)) return { ok: false, error: "Please choose an email type." };
  if (input.format !== "html" && input.format !== "text") return { ok: false, error: "Please choose HTML or plain text." };
  if (input.body_template.length > 200_000) return { ok: false, error: "This template is too large (over 200 KB)." };
  const t = {
    type: input.type as TemplateType,
    format: input.format,
    subject_template: input.subject_template.trim(),
    body_template: input.body_template,
  } as const;
  const errors = validateTemplate(t);
  if (errors.length) return { ok: false, error: `Not saved. Please fix: ${errors[0]}` };
  const saved = await saveTemplate({ ...t, job_id: input.job_id || null, name: input.name.trim().slice(0, 200) });
  await logActivity({ actor: "hr", action: "template.saved", entity: "template", entityId: saved.id, details: { type: saved.type, job_id: saved.job_id } });
  revalidatePath("/email-formats");
  return { ok: true, message: "Email format saved.", data: { id: saved.id } };
}

export async function resetTemplateAction(id: string): Promise<ActionResult> {
  await requireUser();
  const t = await getTemplate(id);
  if (!t) return { ok: true, message: "Already using the default." };
  await deleteTemplate(id);
  await logActivity({ actor: "hr", action: "template.reset", entity: "template", entityId: id, details: { type: t.type, job_id: t.job_id } });
  revalidatePath("/email-formats");
  return { ok: true, message: "Back to the built-in default." };
}
