import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "../helpers/db";
import { LINK, seedBasics } from "../helpers/seed";
import { createDraft } from "@/lib/drafting/create-draft";
import { resolveInterviewLink } from "@/lib/links/resolve";
import { setAiProviderForTests } from "@/lib/ai/client";
import { mockProvider } from "@/lib/ai/mock";
import { updateCandidate, getCandidate } from "@/lib/data/candidates";
import { updateJob } from "@/lib/data/jobs";
import { updateSettings } from "@/lib/data/settings";
import type { Db } from "@/lib/db/types";
import type { AiProvider } from "@/lib/ai/types";
import type { OutboxRow } from "@/lib/types";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});
afterEach(() => setAiProviderForTests(undefined));

const outbox = () => db.query<OutboxRow>("select * from outbox order by created_at");

describe("interview link priority", () => {
  it("candidate override > job link > settings default", () => {
    const c = "https://interview.example.com/candidate";
    const j = "https://interview.example.com/job";
    const s = "https://interview.example.com/default";
    expect(resolveInterviewLink({ candidateOverride: c, jobLink: j, defaultLink: s })).toEqual({ link: c, source: "candidate" });
    expect(resolveInterviewLink({ candidateOverride: "", jobLink: j, defaultLink: s })).toEqual({ link: j, source: "job" });
    expect(resolveInterviewLink({ candidateOverride: null, jobLink: null, defaultLink: s })).toEqual({ link: s, source: "settings" });
  });

  it("only valid https:// URLs count", () => {
    expect(resolveInterviewLink({ candidateOverride: "http://interview.example.com/x", jobLink: "not a url", defaultLink: null })).toBeNull();
    expect(resolveInterviewLink({ candidateOverride: "ftp://x.example.com", jobLink: "https://interview.example.com/ok" })?.source).toBe("job");
  });
});

describe("createDraft", () => {
  it("outreach with mock AI passes both checks and lands as a draft", async () => {
    const { candidate } = await seedBasics();
    const res = await createDraft({ candidateId: candidate.id, type: "outreach", actor: "cron" });
    expect(res).toMatchObject({ outcome: "created", status: "draft" });
    const [row] = await outbox();
    expect(row).toMatchObject({ type: "outreach", status: "draft", checker_score: 9, rewrite_count: 0, approved: false, to_email: "asha@example.com" });
    expect(row!.checker_issues).toEqual([]);
    expect(row!.html).toContain("Hi Asha");
    expect(row!.text).toContain("Senior Accountant");
    expect(row!.text).toContain("Best regards");
  });

  it("is idempotent: a second run does not create another draft", async () => {
    const { candidate } = await seedBasics();
    await createDraft({ candidateId: candidate.id, type: "outreach", actor: "cron" });
    expect(await createDraft({ candidateId: candidate.id, type: "outreach", actor: "cron" })).toMatchObject({ outcome: "skipped" });
    expect(await outbox()).toHaveLength(1);
  });

  it("invite contains the exact resolved link (candidate override wins)", async () => {
    const { candidate } = await seedBasics();
    const override = "https://interview.example.com/just-for-asha";
    await updateCandidate(candidate.id, { interview_link_override: override, stage: "interested" });
    await createDraft({ candidateId: candidate.id, type: "interview_invite", actor: "cron" });
    const [row] = await outbox();
    expect(row!.status).toBe("draft");
    expect(row!.interview_link).toBe(override);
    expect(row!.html).toContain(`href="${override}"`);
    expect(row!.html).not.toContain(LINK);
  });

  it("no link anywhere: does NOT draft the invite, marks link_missing, no AI call", async () => {
    const { candidate } = await seedBasics({ link: null });
    let calls = 0;
    const counting: AiProvider = { name: "test", complete: async (t) => { calls++; return mockProvider.complete(t); } };
    setAiProviderForTests(counting);
    const res = await createDraft({ candidateId: candidate.id, type: "interview_invite", actor: "cron" });
    expect(res.outcome).toBe("link_missing");
    const [row] = await outbox();
    expect(row).toMatchObject({ status: "link_missing", body: "", html: "" });
    expect((await getCandidate(candidate.id))!.stage).toBe("link_missing");
    expect(calls).toBe(0);
  });

  it("settings default link is used when the job has none", async () => {
    const { candidate } = await seedBasics({ link: null });
    await updateSettings({ default_interview_link: "https://interview.example.com/default" });
    await createDraft({ candidateId: candidate.id, type: "interview_invite", actor: "cron" });
    expect((await outbox())[0]!.interview_link).toBe("https://interview.example.com/default");
  });

  it("auto_send on: a draft that passed both checks is auto-approved", async () => {
    const { candidate } = await seedBasics({ autoSend: true });
    expect(await createDraft({ candidateId: candidate.id, type: "outreach", actor: "cron" })).toMatchObject({ status: "approved" });
    expect((await outbox())[0]).toMatchObject({ approved: true, status: "approved" });
  });

  it("auto_send on: needs_review is never auto-approved", async () => {
    const { candidate } = await seedBasics({ autoSend: true });
    // An AI that keeps writing a URL into the email fails the rules twice.
    const bad: AiProvider = {
      name: "test",
      complete: async (t) => (t.kind === "checker" ? { text: '{"score":9,"issues":[]}', model: "t" } : {
        text: JSON.stringify({ subject: "Senior Accountant role", body: "Hi Asha, see https://acme.example.com for the Senior Accountant role. ".repeat(4) }),
        model: "t",
      }),
    };
    setAiProviderForTests(bad);
    expect(await createDraft({ candidateId: candidate.id, type: "outreach", actor: "cron" })).toMatchObject({ status: "needs_review" });
    const [row] = await outbox();
    expect(row).toMatchObject({ approved: false, rewrite_count: 1 });
    expect(row!.checker_issues.map((i) => i.rule)).toContain("no_urls");
  });

  it("auto_send on: a reply to an 'other' message is never auto-approved", async () => {
    const { candidate } = await seedBasics({ autoSend: true });
    const [msg] = await db.query<{ id: string }>(
      "insert into messages (candidate_id, direction, body_text) values ($1, 'in', 'hmm, about my cousin') returning id",
      [candidate.id],
    );
    const res = await createDraft({ candidateId: candidate.id, type: "reply", actor: "webhook", reply: { messageId: msg!.id, category: "other", subject: "Re", text: "hmm, about my cousin" } });
    expect(res).toMatchObject({ status: "needs_review" });
    expect((await outbox())[0]!.approved).toBe(false);
  });

  it("skips paused jobs, frozen candidates and do-not-email", async () => {
    const { job, candidate } = await seedBasics();
    await updateJob(job.id, { status: "paused" });
    expect(await createDraft({ candidateId: candidate.id, type: "outreach", actor: "cron" })).toMatchObject({ outcome: "skipped", reason: "job is paused" });
    await updateJob(job.id, { status: "open" });
    await updateCandidate(candidate.id, { stage: "hired" });
    expect((await createDraft({ candidateId: candidate.id, type: "outreach", actor: "cron" })).outcome).toBe("skipped");
    await updateCandidate(candidate.id, { stage: "new", do_not_email: true });
    expect((await createDraft({ candidateId: candidate.id, type: "outreach", actor: "cron" })).outcome).toBe("skipped");
    expect(await outbox()).toHaveLength(0);
  });

  it("AI failure (invalid JSON twice) falls back safely to needs_review", async () => {
    const { candidate } = await seedBasics();
    setAiProviderForTests({ name: "test", complete: async () => ({ text: "I cannot do JSON", model: "t" }) });
    expect(await createDraft({ candidateId: candidate.id, type: "outreach", actor: "cron" })).toMatchObject({ status: "needs_review" });
    expect((await outbox())[0]!.checker_issues[0]!.rule).toBe("ai_failed");
  });
});
