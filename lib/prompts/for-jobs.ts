import type { PromptDefaults } from "@/app/(app)/jobs/job-form";
import { getPromptOverrides } from "@/lib/data/prompts";
import { resolveInstructions } from "./resolve";

/** The global prompt text for each job-overridable type, shown as placeholders in the job form. */
export async function getPromptDefaultsForJobs(): Promise<PromptDefaults> {
  const overrides = await getPromptOverrides();
  const types = ["outreach", "interview_invite", "followup", "feedback"] as const;
  return Object.fromEntries(types.map((t) => [t, resolveInstructions(t, null, overrides).text]));
}
