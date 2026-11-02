"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { resetPrompt, savePrompt } from "@/lib/data/prompts";
import { PROMPT_TYPES, type PromptType } from "@/lib/types";
import type { ActionResult } from "@/lib/validation";

export async function savePromptAction(type: string, instructions: string): Promise<ActionResult> {
  await requireUser();
  if (!(PROMPT_TYPES as readonly string[]).includes(type)) return { ok: false, error: "Unknown prompt." };
  const text = instructions.trim();
  if (text.length < 20) return { ok: false, error: "The prompt is too short. Write at least a sentence or two, or reset to the default." };
  if (text.length > 20_000) return { ok: false, error: "The prompt is too long (max 20,000 characters)." };
  await savePrompt(type as PromptType, text);
  await logActivity({ actor: "hr", action: "prompt.saved", entity: "prompt", entityId: type });
  revalidatePath("/prompts");
  return { ok: true, message: "Prompt saved. New drafts will use it." };
}

export async function resetPromptAction(type: string): Promise<ActionResult> {
  await requireUser();
  if (!(PROMPT_TYPES as readonly string[]).includes(type)) return { ok: false, error: "Unknown prompt." };
  await resetPrompt(type as PromptType);
  await logActivity({ actor: "hr", action: "prompt.reset", entity: "prompt", entityId: type });
  revalidatePath("/prompts");
  return { ok: true, message: "Back to the default prompt." };
}
