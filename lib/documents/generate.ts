import { aiJson } from "@/lib/ai/client";
import { DocumentSchema, type DocumentDraft } from "@/lib/ai/schemas";
import { getPromptOverrides } from "@/lib/data/prompts";
import { getSettings } from "@/lib/data/settings";
import { getDb } from "@/lib/db/client";
import { buildDocumentMessages, resolveInstructions } from "@/lib/prompts/resolve";
import { DECISION_LABELS, type Candidate, type Job } from "@/lib/types";

/** Context for documents: company, tone, and (when linked) job facts, criteria and candidate. */
export function buildDocumentContext(input: {
  type: "jd" | "feedback";
  companyName: string;
  tone: string;
  job: Job | null;
  candidate: Pick<Candidate, "name" | "hr_notes" | "decision" | "profile_notes"> | null;
}): string {
  const { job, candidate } = input;
  const lines = ["CONTEXT", "=== COMPANY ===", `Company name: ${input.companyName}`, "=== TONE ===", job?.tone || input.tone];
  if (job) {
    lines.push(
      "=== JOB ===",
      `Job title: ${job.title}`,
      `Location: ${job.location ?? "Not provided"}`,
      `Work mode: ${job.work_mode ?? "Not provided"}`,
      `Salary range: ${job.salary_range ?? "Not provided - do not mention salary"}`,
    );
    if (input.type === "jd" && job.jd.trim()) lines.push("=== CURRENT JOB DESCRIPTION ===", job.jd.slice(0, 6000));
    if (input.type === "feedback") lines.push("=== FEEDBACK CRITERIA ===", job.feedback_criteria?.trim() || "None given - use general criteria: skills, experience, communication.");
  }
  if (candidate && input.type === "feedback") {
    lines.push(
      "=== CANDIDATE ===",
      `Name: ${candidate.name}`,
      `Profile notes: ${candidate.profile_notes ?? "None"}`,
      `HR interview notes: ${candidate.hr_notes ?? "None"}`,
      `Decision: ${candidate.decision ? DECISION_LABELS[candidate.decision] : "Not decided"}`,
    );
  }
  return lines.join("\n");
}

export async function generateDocument(input: {
  type: "jd" | "feedback";
  notes: string;
  jobId: string | null;
  candidateId: string | null;
}): Promise<DocumentDraft> {
  const db = await getDb();
  const [settings, overrides] = await Promise.all([getSettings(), getPromptOverrides()]);
  const job = input.jobId ? ((await db.query<Job>("select * from jobs where id = $1", [input.jobId]))[0] ?? null) : null;
  const candidate = input.candidateId ? ((await db.query<Candidate>("select * from candidates where id = $1", [input.candidateId]))[0] ?? null) : null;
  const promptType = input.type === "jd" ? "jd_doc" : "feedback_doc";
  const instructions = resolveInstructions(promptType, job, overrides);
  const context = buildDocumentContext({ type: input.type, companyName: settings.company_name, tone: settings.tone, job, candidate });
  const title = input.type === "jd" ? (job?.title ?? "Job description") : `Interview feedback: ${candidate?.name ?? "candidate"}${job ? ` - ${job.title}` : ""}`;
  const res = await aiJson(
    { kind: promptType, messages: buildDocumentMessages(instructions.text, context, input.notes), mock: { docTitle: title, notes: input.notes }, maxTokens: 2500 },
    DocumentSchema,
  );
  return { title: res.data.title || title, content: res.data.content };
}
