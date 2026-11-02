import { DEFAULT_UNSUBSCRIBE_TEXT, firstName, type TemplateData } from "./placeholders";
import type { Candidate, Job, Settings } from "@/lib/types";

export function buildTemplateData(input: {
  settings: Pick<Settings, "company_name" | "logo_url" | "brand_color" | "sender_name" | "signature">;
  job: Pick<Job, "title"> | null;
  candidate: Pick<Candidate, "name">;
  subject: string;
  body: string;
  interviewLink?: string | null;
}): TemplateData {
  const { settings, job, candidate } = input;
  return {
    candidate_name: candidate.name.trim(),
    candidate_first_name: firstName(candidate.name),
    job_title: job?.title ?? "",
    company_name: settings.company_name,
    interview_link: input.interviewLink ?? "",
    body: input.body,
    signature: settings.signature || `${settings.sender_name}\n${settings.company_name}`,
    sender_name: settings.sender_name,
    logo_url: settings.logo_url ?? "",
    brand_color: /^#[0-9a-fA-F]{6}$/.test(settings.brand_color) ? settings.brand_color : "#2563eb",
    unsubscribe_text: DEFAULT_UNSUBSCRIBE_TEXT,
    subject: input.subject,
  };
}
