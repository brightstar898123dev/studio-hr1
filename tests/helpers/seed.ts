import { createCandidate } from "@/lib/data/candidates";
import { createJob } from "@/lib/data/jobs";
import { updateSettings } from "@/lib/data/settings";
import { CandidateSchema, JobSchema } from "@/lib/validation";

export const LINK = "https://interview.example.com/senior-accountant";

export async function seedBasics(opts: { link?: string | null; autoSend?: boolean } = {}) {
  await updateSettings({
    company_name: "Acme",
    sender_name: "Priya",
    sender_email: "hr@company.com",
    reply_domain: "reply.company.com",
    signature: "Best regards,\nPriya\nAcme HR",
    hr_digest_email: "hr@company.com",
    auto_send: opts.autoSend ?? false,
  });
  const job = await createJob(
    JobSchema.parse({
      title: "Senior Accountant",
      jd: "# Senior Accountant\nYou will own the monthly close and work with auditors.",
      location: "Pune",
      work_mode: "hybrid",
      interview_link: opts.link === undefined ? LINK : (opts.link ?? ""),
      reply_notes: "Notice period of up to 30 days is fine.",
      feedback_criteria: "Accounting knowledge, Excel, communication",
    }),
  );
  const candidate = await createCandidate(
    CandidateSchema.parse({ name: "Asha Rao", email: "asha@example.com", job_id: job.id, profile_notes: "5 years in audit" }),
  );
  return { job, candidate };
}
