import { beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "../helpers/db";
import { createCandidate, DuplicateEmailError, findCandidateByEmail, importCandidates, listCandidates } from "@/lib/data/candidates";
import { createJob } from "@/lib/data/jobs";
import { CandidateSchema, JobSchema } from "@/lib/validation";

describe("candidates data", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("finds candidates by email case-insensitively", async () => {
    await createCandidate(CandidateSchema.parse({ name: "Asha Rao", email: "asha@example.com" }));
    expect((await findCandidateByEmail("ASHA@Example.com"))?.name).toBe("Asha Rao");
  });

  it("rejects duplicate emails with a friendly error", async () => {
    await createCandidate(CandidateSchema.parse({ name: "Asha", email: "asha@example.com" }));
    await expect(createCandidate(CandidateSchema.parse({ name: "Asha 2", email: "ASHA@example.com" }))).rejects.toBeInstanceOf(
      DuplicateEmailError,
    );
  });

  it("CSV import skips duplicates and invalid rows, never overwrites", async () => {
    const job = await createJob(JobSchema.parse({ title: "Accountant" }));
    await createCandidate(CandidateSchema.parse({ name: "Existing", email: "old@example.com" }));
    const res = await importCandidates(
      [
        { name: "A", email: "a@example.com" },
        { name: "B", email: "OLD@example.com" },
        { name: "", email: "c@example.com" },
        { name: "D", email: "nope" },
        { name: "A again", email: "A@example.com" },
      ],
      job.id,
    );
    expect(res.created).toBe(1);
    expect(res.duplicates).toEqual(["old@example.com", "a@example.com"]);
    expect(res.invalid.map((i) => i.row)).toEqual([3, 4]);
    expect((await findCandidateByEmail("old@example.com"))?.name).toBe("Existing");
    const list = await listCandidates({ jobId: job.id });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ stage: "new", job_title: "Accountant", source: "CSV import" });
  });

  it("search matches name and email", async () => {
    await createCandidate(CandidateSchema.parse({ name: "Ravi Kumar", email: "ravi@example.com" }));
    await createCandidate(CandidateSchema.parse({ name: "Meera", email: "meera@example.com" }));
    expect((await listCandidates({ q: "ravi" })).map((c) => c.name)).toEqual(["Ravi Kumar"]);
    expect((await listCandidates({ q: "MEERA@" })).map((c) => c.name)).toEqual(["Meera"]);
  });
});
