/** Domain types shared across the app. Mirrors supabase/migrations. */

export const JOB_STATUSES = ["open", "paused", "closed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const WORK_MODES = ["onsite", "remote", "hybrid"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const MAIN_STAGES = [
  "new",
  "contacted",
  "interested",
  "interview_invited",
  "interviewed",
  "feedback_sent",
] as const;
export const SIDE_STAGES = [
  "not_interested",
  "question_pending",
  "reschedule_requested",
  "needs_hr",
  "link_missing",
  "paused",
  "hired",
  "rejected",
] as const;
export const STAGES = [...MAIN_STAGES, ...SIDE_STAGES] as const;
export type Stage = (typeof STAGES)[number];

/** Automation ignores candidates in these stages. */
export const FROZEN_STAGES: readonly Stage[] = ["paused", "hired", "rejected"];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  interview_invited: "Interview invited",
  interviewed: "Interviewed",
  feedback_sent: "Feedback sent",
  not_interested: "Not interested",
  question_pending: "Question pending",
  reschedule_requested: "Reschedule requested",
  needs_hr: "Needs HR",
  link_missing: "Link missing",
  paused: "Paused",
  hired: "Hired",
  rejected: "Rejected",
};

export const DECISIONS = ["move_forward", "not_selected", "on_hold"] as const;
export type Decision = (typeof DECISIONS)[number];
export const DECISION_LABELS: Record<Decision, string> = {
  move_forward: "Moving forward",
  not_selected: "Not selected",
  on_hold: "On hold",
};

export const EMAIL_TYPES = ["outreach", "interview_invite", "followup", "feedback", "reply"] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];
export const TEMPLATE_TYPES = [...EMAIL_TYPES, "digest"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];
export const EMAIL_TYPE_LABELS: Record<TemplateType, string> = {
  outreach: "First outreach",
  interview_invite: "Interview invite",
  followup: "Follow-up",
  feedback: "Feedback",
  reply: "Reply to candidate",
  digest: "Daily digest (to HR)",
};

export const OUTBOX_STATUSES = [
  "draft",
  "needs_review",
  "link_missing",
  "approved",
  "sending",
  "sent",
  "failed",
  "rejected",
] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const REPLY_CATEGORIES = ["interested", "not_interested", "question", "reschedule", "other"] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

export const PROMPT_TYPES = [
  "outreach",
  "interview_invite",
  "followup",
  "feedback",
  "classify_reply",
  "reply_interested",
  "reply_not_interested",
  "reply_question",
  "reply_reschedule",
  "reply_other",
  "checker",
  "jd_doc",
  "feedback_doc",
] as const;
export type PromptType = (typeof PROMPT_TYPES)[number];

export type Settings = {
  id: number;
  company_name: string;
  logo_url: string | null;
  brand_color: string;
  sender_name: string;
  sender_email: string;
  reply_domain: string;
  signature: string;
  tone: string;
  followup_days: number;
  max_followups: number;
  daily_send_limit: number;
  outreach_batch_size: number;
  auto_send: boolean;
  checker_pass_mark: number;
  hr_digest_email: string | null;
  default_interview_link: string | null;
  created_at: string;
  updated_at: string;
};

export type Job = {
  id: string;
  title: string;
  status: JobStatus;
  jd: string;
  location: string | null;
  work_mode: WorkMode | null;
  salary_range: string | null;
  must_mention: string | null;
  tone: string | null;
  screening_questions: string | null;
  interview_link: string | null;
  prompt_outreach: string | null;
  prompt_interview_invite: string | null;
  prompt_followup: string | null;
  prompt_feedback: string | null;
  reply_notes: string | null;
  feedback_criteria: string | null;
  created_at: string;
  updated_at: string;
};

export type Candidate = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  job_id: string | null;
  stage: Stage;
  source: string | null;
  profile_notes: string | null;
  interview_link_override: string | null;
  hr_notes: string | null;
  decision: Decision | null;
  followup_count: number;
  last_contacted_at: string | null;
  last_reply_at: string | null;
  do_not_email: boolean;
  reply_token: string;
  created_at: string;
  updated_at: string;
};

export type Template = {
  id: string;
  type: TemplateType;
  job_id: string | null;
  name: string;
  format: "html" | "text";
  subject_template: string;
  body_template: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type CheckerIssue = {
  rule: string;
  message: string;
  source: "rules" | "ai" | "system";
};

export type OutboxRow = {
  id: string;
  candidate_id: string;
  job_id: string | null;
  type: EmailType;
  to_email: string;
  subject: string;
  body: string;
  html: string;
  text: string;
  interview_link: string | null;
  reply_category: ReplyCategory | null;
  in_reply_to: string | null;
  status: OutboxStatus;
  approved: boolean;
  approved_at: string | null;
  checker_score: number | null;
  checker_issues: CheckerIssue[];
  rewrite_count: number;
  edited_by_hr: boolean;
  claimed_at: string | null;
  sent_at: string | null;
  brevo_message_id: string | null;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  candidate_id: string | null;
  direction: "in" | "out";
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  category: string | null;
  outbox_id: string | null;
  external_id: string | null;
  raw: unknown;
  created_at: string;
};

export type DocumentRow = {
  id: string;
  type: "jd" | "feedback";
  title: string;
  job_id: string | null;
  candidate_id: string | null;
  notes: string;
  content: string;
  status: "draft" | "final";
  created_at: string;
  updated_at: string;
};

export type ActivityRow = {
  id: string;
  actor: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};
