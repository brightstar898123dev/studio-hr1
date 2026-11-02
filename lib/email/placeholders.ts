/** Placeholders HR can use in email templates. */
export const PLACEHOLDERS = {
  candidate_name: "Candidate's full name",
  candidate_first_name: "Candidate's first name",
  job_title: "Job title, exactly as written on the job",
  company_name: "Your company name (Settings)",
  interview_link: "The Flowmingo interview link (added by the system, never by the AI)",
  body: "The email text written by the AI (required)",
  signature: "Your signature (Settings)",
  sender_name: "Sender name (Settings)",
  logo_url: "Your logo link (Settings). Empty if not set",
  brand_color: "Your brand colour, e.g. #2563eb (Settings)",
  unsubscribe_text: "A short line telling people how to stop emails",
} as const;
export type PlaceholderName = keyof typeof PLACEHOLDERS;

/** Only allowed in the subject line: the subject written by the AI. */
export const SUBJECT_ONLY_PLACEHOLDERS = { subject: "The subject line written by the AI" } as const;

export const ALL_PLACEHOLDER_NAMES = [...Object.keys(PLACEHOLDERS), ...Object.keys(SUBJECT_ONLY_PLACEHOLDERS)];

export type TemplateData = Record<PlaceholderName, string> & { subject: string };

export const DEFAULT_UNSUBSCRIBE_TEXT = "If you would prefer not to receive emails from us about this role, just reply \"unsubscribe\".";

export function firstName(fullName: string): string {
  const cleaned = fullName.trim().replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s+/i, "");
  return cleaned.split(/\s+/)[0] ?? cleaned;
}

/** Example data for the template preview. */
export const SAMPLE_DATA: TemplateData = {
  candidate_name: "Asha Rao",
  candidate_first_name: "Asha",
  job_title: "Senior Accountant",
  company_name: "Your Company",
  interview_link: "https://interview.example.com/your-interview",
  body:
    "Thank you for your interest in the Senior Accountant role. I enjoyed reading about your experience with month-end closing.\n\nThe next step is a short online interview that you can take at a time that suits you. It takes about 20 minutes.\n\nIf you have any questions, just reply to this email.",
  signature: "Best regards,\nHR Team\nYour Company",
  sender_name: "HR Team",
  logo_url: "",
  brand_color: "#2563eb",
  unsubscribe_text: DEFAULT_UNSUBSCRIBE_TEXT,
  subject: "Next step for the Senior Accountant role",
};
