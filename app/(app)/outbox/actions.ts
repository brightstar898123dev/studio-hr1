"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { sanitizeEmailHtml } from "@/lib/email/sanitize";
import { approve, editDraft, getOutboxRow, recheck, reject, retryFailed } from "@/lib/outbox/operations";
import { sendApproved } from "@/lib/sender/send";
import type { OutboxRow } from "@/lib/types";
import type { ActionResult } from "@/lib/validation";

export type OutboxDetail = OutboxRow & {
  candidate_name: string;
  job_title: string | null;
  preview_html: string;
  reply_text: string | null;
};

function refresh() {
  revalidatePath("/outbox");
  revalidatePath("/", "layout");
}

export async function getOutboxDetailAction(id: string): Promise<OutboxDetail | null> {
  await requireUser();
  const db = await getDb();
  const rows = await db.query<OutboxRow & { candidate_name: string; job_title: string | null; reply_text: string | null }>(
    `select o.*, c.name as candidate_name, j.title as job_title, m.body_text as reply_text
     from outbox o join candidates c on c.id = o.candidate_id left join jobs j on j.id = o.job_id
     left join messages m on m.id = o.in_reply_to where o.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, preview_html: row.html ? sanitizeEmailHtml(row.html) : "" };
}

export async function approveAction(ids: string[]): Promise<ActionResult> {
  await requireUser();
  const res = await approve(ids.slice(0, 500));
  refresh();
  if (res.approved === 0) return { ok: false, error: "Nothing was approved. Emails without text or that are already sent cannot be approved." };
  return {
    ok: true,
    message: `${res.approved} email${res.approved === 1 ? "" : "s"} approved. They go out with the next send run.${res.skipped ? ` ${res.skipped} skipped.` : ""}`,
  };
}

export async function rejectAction(id: string): Promise<ActionResult> {
  await requireUser();
  const res = await reject(id);
  refresh();
  return res.ok ? { ok: true, message: res.message } : { ok: false, error: res.error };
}

export async function retryAction(id: string): Promise<ActionResult> {
  await requireUser();
  const res = await retryFailed(id);
  refresh();
  return res.ok ? { ok: true, message: res.message } : { ok: false, error: res.error };
}

export async function editAction(id: string, subject: string, body: string): Promise<ActionResult> {
  await requireUser();
  if (!subject.trim() || !body.trim()) return { ok: false, error: "Subject and text cannot be empty." };
  if (subject.length > 300 || body.length > 20_000) return { ok: false, error: "The email is too long." };
  const res = await editDraft(id, subject, body);
  refresh();
  return res.ok ? { ok: true, message: res.message } : { ok: false, error: res.error };
}

export async function recheckAction(id: string): Promise<ActionResult> {
  await requireUser();
  const res = await recheck(id);
  refresh();
  return res.ok ? { ok: true, message: res.message } : { ok: false, error: res.error };
}

/** Sends one approved email right away (normally the scheduled job does this). */
export async function sendNowAction(id: string): Promise<ActionResult> {
  await requireUser();
  const row = await getOutboxRow(id);
  if (!row || row.status !== "approved") return { ok: false, error: "Only approved emails can be sent." };
  const res = await sendApproved({ actor: "hr", ids: [id], max: 1 });
  refresh();
  if (res.sent === 1) return { ok: true, message: "Sent." };
  if (res.limitReached) return { ok: false, error: `Today's send limit (${res.dailyLimit}) is reached. It will go out tomorrow.` };
  const after = await getOutboxRow(id);
  return { ok: false, error: after?.error ?? "Not sent. See the email for details." };
}
