import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "../helpers/db";
import { seedBasics } from "../helpers/seed";
import { buildDocumentContext, generateDocument } from "@/lib/documents/generate";
import { setAiProviderForTests } from "@/lib/ai/client";
import { CORE_RULES } from "@/lib/prompts/defaults";
import type { AiTask } from "@/lib/ai/types";

beforeEach(async () => {
  await freshDb();
});
afterEach(() => setAiProviderForTests(undefined));

describe("documents", () => {
  it("drafts a JD from notes with the jd_doc prompt and document rules", async () => {
    const { job } = await seedBasics();
    let seen: AiTask | undefined;
    setAiProviderForTests({
      name: "test",
      complete: async (t) => {
        seen = t;
        return { text: JSON.stringify({ title: "Senior Accountant", content: "# Senior Accountant\n\n## About the role\nOwn the close." }), model: "t" };
      },
    });
    const doc = await generateDocument({ type: "jd", notes: "Own month-end close, 5+ yrs", jobId: job.id, candidateId: null });
    expect(doc.content).toContain("## About the role");
    expect(seen!.kind).toBe("jd_doc");
    expect(seen!.messages[0]!.content).toContain(CORE_RULES.document);
    expect(seen!.messages[1]!.content).toContain("Own month-end close, 5+ yrs");
    expect(seen!.messages[1]!.content).toContain("Salary range: Not provided - do not mention salary");
  });

  it("feedback context uses the job's feedback criteria and the candidate's notes", async () => {
    const { job } = await seedBasics();
    const ctx = buildDocumentContext({
      type: "feedback", companyName: "Acme", tone: "warm", job,
      candidate: { name: "Asha Rao", hr_notes: "Great with Excel", decision: "move_forward", profile_notes: null },
    });
    expect(ctx).toContain("Accounting knowledge, Excel, communication");
    expect(ctx).toContain("Great with Excel");
    expect(ctx).toContain("Moving forward");
  });

  it("works in mock mode", async () => {
    const { job, candidate } = await seedBasics();
    const doc = await generateDocument({ type: "feedback", notes: "Clear answers, needs more audit depth", jobId: job.id, candidateId: candidate.id });
    expect(doc.title).toContain("Asha Rao");
    expect(doc.content).toContain("Clear answers");
  });
});
