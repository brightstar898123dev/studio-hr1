import { z } from "zod";
import { DECISIONS, JOB_STATUSES, STAGES, WORK_MODES } from "@/lib/types";

/** True only for well-formed https:// URLs (the only links we ever put in emails). */
export function isValidHttpsUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  if (!/^https:\/\//i.test(v) || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export function isValidEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return z.email().safeParse(value.trim()).success;
}

/** Empty strings become null. */
const text = (max = 20_000) =>
  z
    .string()
    .max(max, `Please keep this under ${max} characters.`)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

const httpsUrl = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .refine((v) => v === null || isValidHttpsUrl(v), "This must be a full link starting with https://");

export const JobSchema = z.object({
  title: z.string().trim().min(1, "Please give the job a title.").max(200),
  status: z.enum(JOB_STATUSES).default("open"),
  jd: z.string().max(50_000).default(""),
  location: text(200),
  work_mode: z
    .enum(WORK_MODES)
    .or(z.literal(""))
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  salary_range: text(200),
  must_mention: text(2000),
  tone: text(500),
  screening_questions: text(5000),
  interview_link: httpsUrl,
  prompt_outreach: text(),
  prompt_interview_invite: text(),
  prompt_followup: text(),
  prompt_feedback: text(),
  reply_notes: text(),
  feedback_criteria: text(),
});
export type JobInput = z.infer<typeof JobSchema>;

export const CandidateSchema = z.object({
  name: z.string().trim().min(1, "Please enter the candidate's name.").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => isValidEmail(v), "Please enter a valid email address."),
  phone: text(50),
  job_id: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v : null)),
  stage: z.enum(STAGES).default("new"),
  source: text(200),
  profile_notes: text(),
  interview_link_override: httpsUrl,
  hr_notes: text(),
  decision: z
    .enum(DECISIONS)
    .or(z.literal(""))
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});
export type CandidateInput = z.infer<typeof CandidateSchema>;

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #2563eb.");

const optionalEmail = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .refine((v) => v === null || isValidEmail(v), "Please enter a valid email address.");

const int = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} must be at most ${max}.`);

export const SettingsSchema = z.object({
  company_name: z.string().trim().min(1, "Please enter your company name.").max(200),
  logo_url: httpsUrl,
  brand_color: hexColor,
  sender_name: z.string().trim().min(1, "Please enter a sender name.").max(200),
  sender_email: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidEmail(v), "Please enter a valid email address."),
  reply_domain: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v), "Use a domain like reply.company.com (no https://)."),
  signature: z.string().max(2000).default(""),
  tone: z.string().trim().min(1, "Please describe the tone.").max(500),
  followup_days: int(1, 60, "Follow-up days"),
  max_followups: int(0, 10, "Max follow-ups"),
  daily_send_limit: int(0, 300, "Daily send limit"),
  outreach_batch_size: int(1, 200, "Outreach batch size"),
  auto_send: z.boolean(),
  checker_pass_mark: int(0, 10, "Checker pass mark"),
  hr_digest_email: optionalEmail,
  default_interview_link: httpsUrl,
});
export type SettingsInput = z.infer<typeof SettingsSchema>;

/** Turns zod errors into { field: "message" } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
