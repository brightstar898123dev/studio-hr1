import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshDb } from "../helpers/db";
import { seedBasics } from "../helpers/seed";
import { createDraft } from "@/lib/drafting/create-draft";
import { sendApproved, stageAfterSend } from "@/lib/sender/send";
import { shouldAutoApprove } from "@/lib/sender/auto-send";
import { approve, editDraft, recheck } from "@/lib/outbox/operations";
import { setMailerForTests, type Mailer, type MailMessage } from "@/lib/mail";
import { createBrevoMailer } from "@/lib/mail/brevo";
import { createCandidate, getCandidate } from "@/lib/data/candidates";
import { updateJob } from "@/lib/data/jobs";
import { updateSettings } from "@/lib/data/settings";
import { CandidateSchema } from "@/lib/validation";
import type { Db } from "@/lib/db/types";
import type { OutboxRow } from "@/lib/types";

let db: Db;
let sent: MailMessage[];
const recorder: Mailer = {
  name: "test",
  async send(m) {
    sent.push(m);
    const id = `msg-${sent.length}`;
    await new Promise((r) => setTimeout(r, 5));
    return { messageId: id, mock: true };
  },
};

beforeEach(async () => {
  db = await freshDb();
  sent = [];
  setMailerForTests(recorder);
});
afterEach(() => setMailerForTests(undefined));

const rows = () => db.query<OutboxRow>("select * from outbox order by created_at");

async function approvedOutreach(n: number) {
  const { job } = await seedBasics();
  const all = [(await db.query<{ id: string }>("select id from candidates"))[0]!.id];
  for (let i = 1; i < n; i++) {
    const c = await createCandidate(CandidateSchema.parse({ name: `Person${i} Test`, email: `p${i}@example.com`, job_id: job.id }));
    all.push(c.id);
  }
  for (const id of all) await createDraft({ candidateId: id, type: "outreach", actor: "cron" });
  const ids = (await rows()).map((r) => r.id);
  await approve(ids);
  return ids;
}

describe("auto-send rule", () => {
  it.each([
    [{ autoSend: false, status: "draft", passedBoth: true }, false],
    [{ autoSend: true, status: "draft", passedBoth: true }, true],
    [{ autoSend: true, status: "draft", passedBoth: false }, false],
    [{ autoSend: true, status: "needs_review", passedBoth: true }, false],
    [{ autoSend: true, status: "link_missing", passedBoth: true }, false],
    [{ autoSend: true, status: "draft", passedBoth: true, replyCategory: "other" }, false],
    [{ autoSend: true, status: "draft", passedBoth: true, replyCategory: "interested" }, true],
  ] as const)("%j -> %s", (input, expected) => {
    expect(shouldAutoApprove(input)).toBe(expected);
  });
});

describe("sender", () => {
  it("sends approved emails once and records everything", async () => {
    await approvedOutreach(1);
    const res = await sendApproved({ actor: "cron" });
    expect(res).toMatchObject({ sent: 1, failed: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: { email: "asha@example.com", name: "Asha Rao" }, from: { email: "hr@company.com", name: "Priya" } });
    expect(sent[0]!.replyTo).toMatch(/^[a-f0-9]{16}@reply\.company\.com$/);
    expect(sent[0]!.html).toContain("Hi Asha");
    expect(sent[0]!.text.length).toBeGreaterThan(20);
    const [row] = await rows();
    expect(row).toMatchObject({ status: "sent", brevo_message_id: "msg-1" });
    const c = (await db.query<{ stage: string; last_contacted_at: string | null }>("select stage, last_contacted_at from candidates"))[0]!;
    expect(c.stage).toBe("contacted");
    expect(c.last_contacted_at).not.toBeNull();
    expect(await db.query("select * from messages where direction = 'out'")).toHaveLength(1);
    expect(await db.query("select * from mail_log")).toHaveLength(1);
  });

  it("concurrent runs never send the same email twice", async () => {
    await approvedOutreach(4);
    const results = await Promise.all(Array.from({ length: 5 }, () => sendApproved({ actor: "cron" })));
    expect(results.reduce((a, r) => a + r.sent, 0)).toBe(4);
    expect(sent).toHaveLength(4);
    expect(new Set(sent.map((m) => m.to.email)).size).toBe(4);
    expect((await rows()).every((r) => r.status === "sent")).toBe(true);
  });

  it("respects the daily send limit", async () => {
    await approvedOutreach(4);
    await updateSettings({ daily_send_limit: 2 });
    const res = await sendApproved({ actor: "cron" });
    expect(res).toMatchObject({ sent: 2, limitReached: true, sentToday: 2 });
    expect((await rows()).filter((r) => r.status === "approved")).toHaveLength(2);
    // Running again the same day sends nothing more.
    expect((await sendApproved({ actor: "cron" })).sent).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it("skips suppressed addresses", async () => {
    await approvedOutreach(1);
    await db.query("insert into suppression (email, reason) values ('ASHA@example.com', 'bounce')");
    const res = await sendApproved({ actor: "cron" });
    expect(res).toMatchObject({ sent: 0, skipped: 1 });
    expect(sent).toHaveLength(0);
    expect((await rows())[0]).toMatchObject({ status: "rejected" });
    expect((await rows())[0]!.error).toMatch(/suppression list \(bounce\)/);
  });

  it("re-runs the rule checks when HR edited after approval", async () => {
    const [id] = await approvedOutreach(1);
    // Edit to something that breaks the rules (a URL + no name) -> not sent.
    await editDraft(id!, "Senior Accountant role", "Hello, please see https://acme.example.com for the Senior Accountant role. ".repeat(3));
    expect((await rows())[0]!.status).toBe("needs_review");
    await db.query("update outbox set status = 'approved', approved = true where id = $1", [id]);
    const res = await sendApproved({ actor: "cron" });
    expect(res.sent).toBe(0);
    expect((await rows())[0]).toMatchObject({ status: "needs_review", approved: false });
    expect(sent).toHaveLength(0);
  });

  it("a good edit after approval stays approved and is sent", async () => {
    const [id] = await approvedOutreach(1);
    const body = "Hi Asha,\n\nI am reaching out about the Senior Accountant role at Acme. Your audit background stood out to us, and we would love to tell you more about the team and the work.\n\nWould you be interested? Just reply to this email.";
    const res = await editDraft(id!, "Senior Accountant role at Acme", body);
    expect(res.ok).toBe(true);
    expect((await rows())[0]).toMatchObject({ status: "approved", edited_by_hr: true });
    expect((await sendApproved({ actor: "cron" })).sent).toBe(1);
    expect(sent[0]!.html).toContain("Your audit background stood out");
  });

  it("an email the provider accepted is always marked sent, even if bookkeeping fails", async () => {
    await approvedOutreach(1);
    // Break the messages table so recording the sent email fails.
    await db.exec("alter table messages add constraint no_out check (direction <> 'out')");
    const res = await sendApproved({ actor: "cron" });
    expect(res.sent).toBe(1);
    expect((await rows())[0]!.status).toBe("sent");
    expect(await db.query("select 1 from activity_log where action = 'email.sent_bookkeeping_failed'")).toHaveLength(1);
  });

  it("marks failures with the error", async () => {
    await approvedOutreach(1);
    setMailerForTests({ name: "test", send: async () => { throw new Error("Brevo returned 400: sender not verified"); } });
    const res = await sendApproved({ actor: "cron" });
    expect(res.failed).toBe(1);
    expect((await rows())[0]).toMatchObject({ status: "failed", error: "Brevo returned 400: sender not verified" });
  });

  it("recovers rows stuck in 'sending' as failed (never re-sends them)", async () => {
    await approvedOutreach(1);
    await db.query("update outbox set status = 'sending', claimed_at = now() - interval '1 hour'");
    const res = await sendApproved({ actor: "cron" });
    expect(res.recovered).toBe(1);
    expect(sent).toHaveLength(0);
    expect((await rows())[0]!.status).toBe("failed");
  });

  it("stage after sending", () => {
    expect(stageAfterSend("outreach", "new")).toBe("contacted");
    expect(stageAfterSend("interview_invite", "interested")).toBe("interview_invited");
    expect(stageAfterSend("feedback", "interviewed")).toBe("feedback_sent");
    expect(stageAfterSend("followup", "contacted")).toBe("contacted");
    expect(stageAfterSend("outreach", "paused")).toBe("paused");
  });
});

describe("outbox operations", () => {
  it("link_missing rows cannot be approved; re-check drafts the invite once a link exists", async () => {
    const { job, candidate } = await seedBasics({ link: null });
    await db.query("update candidates set stage = 'interested' where id = $1", [candidate.id]);
    await createDraft({ candidateId: candidate.id, type: "interview_invite", actor: "cron" });
    const [missing] = await rows();
    expect((await approve([missing!.id])).approved).toBe(0);
    expect((await recheck(missing!.id)).ok).toBe(false);
    await updateJob(job.id, { interview_link: "https://interview.example.com/now-set" });
    expect((await recheck(missing!.id)).ok).toBe(true);
    const [invite] = await rows();
    expect(invite).toMatchObject({ type: "interview_invite", status: "draft", interview_link: "https://interview.example.com/now-set" });
    expect((await getCandidate(candidate.id))!.stage).toBe("interested");
  });
});

describe("Brevo client", () => {
  it("posts htmlContent + textContent with the api-key header", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ messageId: "<abc@smtp-relay>" }), { status: 201 }));
    const m = createBrevoMailer({ apiKey: "key-123", fetchImpl });
    const res = await m.send({ to: { email: "a@example.com", name: "A" }, from: { email: "hr@company.com", name: "HR" }, replyTo: "t@reply.company.com", subject: "S", html: "<p>H</p>", text: "T", kind: "candidate" });
    expect(res.messageId).toBe("<abc@smtp-relay>");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("key-123");
    expect(JSON.parse(init.body as string)).toMatchObject({
      sender: { email: "hr@company.com", name: "HR" }, to: [{ email: "a@example.com", name: "A" }], htmlContent: "<p>H</p>", textContent: "T", replyTo: { email: "t@reply.company.com" },
    });
  });

  it("retries 429/5xx but not 4xx", async () => {
    const flaky = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messageId: "x" }), { status: 201 }));
    await createBrevoMailer({ apiKey: "k", fetchImpl: flaky, sleep: async () => undefined }).send({ to: { email: "a@example.com" }, from: { email: "b@example.com", name: "B" }, subject: "s", html: "h", text: "t", kind: "test" });
    expect(flaky).toHaveBeenCalledTimes(2);
    const bad = vi.fn(async () => new Response(JSON.stringify({ message: "sender not valid" }), { status: 400 }));
    await expect(createBrevoMailer({ apiKey: "k", fetchImpl: bad, sleep: async () => undefined }).send({ to: { email: "a@example.com" }, from: { email: "b@example.com", name: "B" }, subject: "s", html: "h", text: "t", kind: "test" })).rejects.toThrow(/400: sender not valid/);
    expect(bad).toHaveBeenCalledTimes(1);
  });
});

describe("Brevo inbound webhook registration", () => {
  it("creates the inbound webhook once", async () => {
    const { registerBrevoInboundWebhook } = await import("@/lib/mail/brevo-webhook");
    const calls: [string, RequestInit | undefined][] = [];
    const fetchImpl = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(u), init]);
      if (!init?.method) return new Response(JSON.stringify({ webhooks: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: 42 }), { status: 201 });
    });
    const res = await registerBrevoInboundWebhook({ apiKey: "k", url: "https://hr.company.com/api/webhooks/brevo-inbound/s", domain: "reply.company.com", fetchImpl });
    expect(res).toEqual({ ok: true, id: "42", already: false });
    expect(JSON.parse(calls[1]![1]!.body as string)).toMatchObject({ type: "inbound", events: ["inboundEmailProcessed"], domain: "reply.company.com" });
    const again = vi.fn(async () => new Response(JSON.stringify({ webhooks: [{ id: 42, url: "https://hr.company.com/api/webhooks/brevo-inbound/s" }] }), { status: 200 }));
    expect(await registerBrevoInboundWebhook({ apiKey: "k", url: "https://hr.company.com/api/webhooks/brevo-inbound/s", domain: "reply.company.com", fetchImpl: again })).toMatchObject({ already: true });
    expect(again).toHaveBeenCalledTimes(1);
  });
});
