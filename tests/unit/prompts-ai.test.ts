import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buildContext, buildEmailMessages, resolveInstructions, stripQuoted, type PromptContext } from "@/lib/prompts/resolve";
import { CORE_RULES, PROMPT_DEFINITIONS } from "@/lib/prompts/defaults";
import { createOpenRouterProvider } from "@/lib/ai/openrouter";
import { aiJson, setAiProviderForTests } from "@/lib/ai/client";
import { AiJsonError, AiLimitError, type AiProvider } from "@/lib/ai/types";
import { extractJson } from "@/lib/ai/json";
import { classifyText, mockProvider } from "@/lib/ai/mock";
import { freshDb } from "../helpers/db";
import type { Job } from "@/lib/types";

const job: Job = {
  id: "j1", title: "Senior Accountant", status: "open", jd: "# Role\nClose the books monthly.", location: "Pune", work_mode: "hybrid",
  salary_range: null, must_mention: "Immediate joiners preferred", tone: null, screening_questions: null, interview_link: "https://interview.example.com/x",
  prompt_outreach: "JOB OUTREACH PROMPT", prompt_interview_invite: "  ", prompt_followup: null, prompt_feedback: null,
  reply_notes: "Notice period: 30 days is fine.", feedback_criteria: "Excel, communication", created_at: "", updated_at: "",
};

const ctx = (over: Partial<PromptContext> = {}): PromptContext => ({
  settings: { company_name: "Acme", sender_name: "Priya", tone: "warm and professional" },
  job,
  candidate: { name: "Asha Rao", profile_notes: "5 years in audit", stage: "new", hr_notes: null, decision: null },
  history: [],
  emailType: "outreach",
  ...over,
});

describe("prompt resolution", () => {
  it("job override if filled, else global, else built-in default", () => {
    expect(resolveInstructions("outreach", job, { outreach: "GLOBAL" })).toEqual({ text: "JOB OUTREACH PROMPT", source: "job" });
    expect(resolveInstructions("interview_invite", job, { interview_invite: "GLOBAL INVITE" })).toEqual({ text: "GLOBAL INVITE", source: "global" });
    expect(resolveInstructions("followup", job, {})).toEqual({ text: PROMPT_DEFINITIONS.followup.instructions, source: "default" });
    expect(resolveInstructions("outreach", null, {}).source).toBe("default");
  });

  it("classifier and checker cannot be overridden per job", () => {
    expect(resolveInstructions("checker", job, {}).source).toBe("default");
    expect(resolveInstructions("classify_reply", job, { classify_reply: "G" }).text).toBe("G");
  });

  it("core rules are always included, even with a custom prompt", () => {
    const m = buildEmailMessages("Just write something", buildContext(ctx()));
    expect(m[0]!.content).toContain(CORE_RULES.email);
    expect(m[0]!.content).toContain("Never write a URL");
  });
});

describe("context", () => {
  it("includes JD, job facts, candidate, settings and tone", () => {
    const c = buildContext(ctx());
    for (const s of ["Acme", "Priya", "warm and professional", "Job title (write exactly): Senior Accountant", "Close the books monthly", "Pune", "hybrid",
      "Immediate joiners preferred", "First name (use exactly): Asha", "5 years in audit"]) {
      expect(c).toContain(s);
    }
  });

  it("says not to mention salary when none is set", () => {
    expect(buildContext(ctx())).toContain("Not provided - do not mention salary");
    expect(buildContext(ctx({ job: { ...job, salary_range: "8-10 LPA" } }))).toContain("Salary range: 8-10 LPA");
  });

  it("job tone overrides the settings tone", () => {
    expect(buildContext(ctx({ job: { ...job, tone: "playful" } }))).toMatch(/=== TONE ===\nplayful/);
  });

  it("includes only the last N messages, oldest first, and strips quoted text", () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      direction: (i % 2 ? "in" : "out") as "in" | "out",
      subject: `S${i}`,
      body_text: i % 2 ? `message ${i}\n\nOn Mon, 1 Jan 2026, HR wrote:\n> old quoted text` : `message ${i}`,
      created_at: `2026-01-0${i + 1}T00:00:00Z`,
    }));
    const c = buildContext(ctx({ history, historyLimit: 3 }));
    expect(c).not.toContain("message 4");
    expect(c.indexOf("message 5")).toBeLessThan(c.indexOf("message 7"));
    expect(c).not.toContain("old quoted text");
  });

  it("feedback context includes notes, criteria and decision (or explicitly none)", () => {
    const fb = buildContext(ctx({ emailType: "feedback", candidate: { name: "Asha", profile_notes: null, stage: "interviewed", hr_notes: "Strong Excel", decision: null } }));
    expect(fb).toContain("Strong Excel");
    expect(fb).toContain("Excel, communication");
    expect(fb).toContain("No decision yet - do not state or hint at any decision");
  });

  it("invite context tells the model the link is added below", () => {
    const c = buildContext(ctx({ emailType: "interview_invite", interviewLink: "https://interview.example.com/x" }));
    expect(c).toContain("the link below");
    expect(c).not.toContain("https://interview.example.com/x");
  });

  it("reply context includes reply notes and the latest reply", () => {
    const c = buildContext(ctx({ emailType: "reply", latestReply: { subject: "Re: role", text: "What is the notice period?\n> quoted" }, replyCategory: "question" }));
    expect(c).toContain("Notice period: 30 days is fine.");
    expect(c).toContain("What is the notice period?");
    expect(c).not.toContain("> quoted");
  });

  it("stripQuoted keeps the new text only", () => {
    expect(stripQuoted("Yes please!\n\nOn Tue, HR <hr@company.com> wrote:\n> Hi")).toBe("Yes please!");
  });
});

describe("extractJson", () => {
  it("handles code fences and surrounding text", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"subject":"x","body":"y {z}"} hope this helps')).toEqual({ subject: "x", body: "y {z}" });
    expect(() => extractJson("no json")).toThrow();
  });
});

describe("OpenRouter provider", () => {
  const okBody = (content: string, model = "m1") => new Response(JSON.stringify({ model, choices: [{ message: { content } }] }), { status: 200 });
  const task = { kind: "outreach" as const, messages: [{ role: "user" as const, content: "hi" }] };

  it("retries 429/5xx with backoff, then succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("rate", { status: 429 }))
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(okBody('{"ok":true}'));
    const sleep = vi.fn(async () => undefined);
    const before = vi.fn(async () => undefined);
    const p = createOpenRouterProvider({ apiKey: "k", model: "m1", appUrl: "http://localhost:3000", fetchImpl, sleep, beforeRequest: before });
    expect((await p.complete(task)).text).toBe('{"ok":true}');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(before).toHaveBeenCalledTimes(3); // every request is counted
    expect(sleep).toHaveBeenCalledTimes(2);
    const sent = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(sent).toMatchObject({ model: "m1", response_format: { type: "json_object" } });
  });

  it("falls back to the second model when the first keeps failing", async () => {
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { model: string };
      return body.model === "m1" ? new Response("err", { status: 500 }) : okBody('{"ok":true}', "m2");
    });
    const p = createOpenRouterProvider({ apiKey: "k", model: "m1", fallbackModel: "m2", appUrl: "x", fetchImpl, sleep: async () => undefined, maxAttempts: 2 });
    expect(await p.complete(task)).toEqual({ text: '{"ok":true}', model: "m2" });
  });

  it("does not retry or fall back on a bad API key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "No auth" } }), { status: 401 }));
    const p = createOpenRouterProvider({ apiKey: "bad", model: "m1", fallbackModel: "m2", appUrl: "x", fetchImpl, sleep: async () => undefined });
    await expect(p.complete(task)).rejects.toThrow(/401: No auth/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops before calling OpenRouter when the daily limit is reached", async () => {
    const fetchImpl = vi.fn();
    const p = createOpenRouterProvider({
      apiKey: "k", model: "m1", appUrl: "x", fetchImpl, sleep: async () => undefined,
      beforeRequest: async () => { throw new AiLimitError(45); },
    });
    await expect(p.complete(task)).rejects.toBeInstanceOf(AiLimitError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("aiJson", () => {
  beforeEach(async () => {
    await freshDb();
  });
  afterEach(() => setAiProviderForTests(undefined));

  const scripted = (...answers: string[]): AiProvider & { calls: number } => {
    const p = { name: "test", calls: 0, async complete() { return { text: answers[p.calls++] ?? "", model: "test" }; } };
    return p;
  };
  const schema = z.object({ subject: z.string(), body: z.string() });

  it("retries once on invalid JSON", async () => {
    const p = scripted("oops not json", '{"subject":"S","body":"B"}');
    setAiProviderForTests(p);
    expect((await aiJson({ kind: "outreach", messages: [] }, schema)).data).toEqual({ subject: "S", body: "B" });
    expect(p.calls).toBe(2);
  });

  it("gives up after the retry with AiJsonError", async () => {
    const p = scripted("bad", '{"subject": 1}');
    setAiProviderForTests(p);
    await expect(aiJson({ kind: "outreach", messages: [] }, schema)).rejects.toBeInstanceOf(AiJsonError);
    expect(p.calls).toBe(2);
  });
});

describe("mock AI", () => {
  it("writes emails from the hints only", async () => {
    const r = await mockProvider.complete({ kind: "interview_invite", messages: [], mock: { firstName: "Asha", jobTitle: "Senior Accountant", emailType: "interview_invite", hasLink: true } });
    const j = JSON.parse(r.text) as { subject: string; body: string };
    expect(j.body).toContain("Hi Asha");
    expect(j.body).toContain("Senior Accountant");
    expect(j.body).not.toMatch(/https?:\/\//);
  });

  it("classifies typical replies", () => {
    expect(classifyText("Yes, I'm interested!").category).toBe("interested");
    expect(classifyText("Thanks but I have accepted another offer").category).toBe("not_interested");
    expect(classifyText("What is the salary range?").category).toBe("question");
    expect(classifyText("Can we reschedule to next week?").category).toBe("reschedule");
    expect(classifyText("asdf").category).toBe("other");
  });
});
