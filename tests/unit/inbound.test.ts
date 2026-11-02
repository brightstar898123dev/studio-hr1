import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "../helpers/db";
import { LINK, seedBasics } from "../helpers/seed";
import { parseBrevoInbound, type InboundEmail } from "@/lib/inbound/parse";
import { isAutoReply, isBounce, isUnsubscribe } from "@/lib/inbound/detect";
import { ingestInbound, processInboundMessage, processPendingInbound, STAGE_FOR_CATEGORY } from "@/lib/inbound/handle";
import { createDraft } from "@/lib/drafting/create-draft";
import { getCandidate } from "@/lib/data/candidates";
import { setAiProviderForTests } from "@/lib/ai/client";
import { hasBearer, safeEqual } from "@/lib/http/secrets";
import type { Db } from "@/lib/db/types";
import type { OutboxRow } from "@/lib/types";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});
afterEach(() => setAiProviderForTests(undefined));

let n = 0;
function brevoPayload(over: Record<string, unknown> = {}) {
  n++;
  return {
    items: [
      {
        Uuid: [`uuid-${n}`],
        MessageId: `<m${n}@mail.example.com>`,
        InReplyTo: "<orig@smtp-relay.example.com>",
        From: { Name: "Asha Rao", Address: "Asha@Example.com" },
        To: [{ Name: null, Address: "abcdef0123456789@reply.company.com" }],
        Subject: "Re: Senior Accountant opportunity",
        RawHtmlBody: "<p>Yes, I'm interested!</p>",
        RawTextBody: "Yes, I'm interested!\n\nOn Mon, HR wrote:\n> Hi Asha",
        ExtractedMarkdownMessage: "Yes, I'm interested!",
        Headers: { "Message-Id": `<m${n}@mail.example.com>` },
        ...over,
      },
    ],
  };
}

const one = (p: unknown): InboundEmail => parseBrevoInbound(p)[0]!;
const outbox = () => db.query<OutboxRow>("select * from outbox order by created_at");

async function receive(over: Record<string, unknown> = {}) {
  const r = await ingestInbound(one(brevoPayload(over)));
  if (r.kind === "pending") return { ingest: r, processed: await processInboundMessage(r.messageId) };
  return { ingest: r, processed: null };
}

describe("parse Brevo inbound payload", () => {
  it("reads the standard items[] format", () => {
    const e = one(brevoPayload());
    expect(e).toMatchObject({ from: { email: "asha@example.com", name: "Asha Rao" }, to: ["abcdef0123456789@reply.company.com"], text: "Yes, I'm interested!" });
    expect(e.externalId).toMatch(/^uuid-/);
  });
  it("accepts camelCase and a single object, and falls back to HTML text", () => {
    const e = one({ uuid: "x1", from: "Ravi <ravi@example.com>", to: ["t@reply.company.com"], subject: "Hi", rawHtmlBody: "<p>Hello<br>there</p>" });
    expect(e).toMatchObject({ externalId: "x1", from: { email: "ravi@example.com", name: "Ravi" }, text: "Hello\nthere" });
  });
  it("rejects payloads without a sender", () => {
    expect(() => parseBrevoInbound({ items: [{ Uuid: ["a"] }] })).toThrow(/sender/);
    expect(() => parseBrevoInbound("nope")).toThrow();
  });
});

describe("detectors", () => {
  const base = { subject: "Re: role", headers: {}, text: "Thanks", from: { email: "asha@example.com", name: null } };
  it("auto-replies", () => {
    expect(isAutoReply({ ...base, subject: "Out of Office: back Monday" })).toBe(true);
    expect(isAutoReply({ ...base, subject: "Automatic reply: Re: role" })).toBe(true);
    expect(isAutoReply({ ...base, headers: { "auto-submitted": "auto-replied" } })).toBe(true);
    expect(isAutoReply(base)).toBe(false);
  });
  it("bounces", () => {
    expect(isBounce({ ...base, from: { email: "MAILER-DAEMON@mail.example.com", name: null } })).toBe(true);
    expect(isBounce({ ...base, subject: "Undeliverable: Senior Accountant" })).toBe(true);
    expect(isBounce(base)).toBe(false);
  });
  it("unsubscribe requests", () => {
    expect(isUnsubscribe({ subject: "Re: role", text: "Please remove me from your list" })).toBe(true);
    expect(isUnsubscribe({ subject: "unsubscribe", text: "" })).toBe(true);
    expect(isUnsubscribe({ subject: "Re: role", text: "Yes I'm interested" })).toBe(false);
  });
});

describe("reply classification routing", () => {
  it("maps categories to stages", () => {
    expect(STAGE_FOR_CATEGORY).toEqual({
      interested: "interested",
      not_interested: "not_interested",
      question: "question_pending",
      reschedule: "reschedule_requested",
      other: "needs_hr",
    });
  });

  it("interested -> stage interested + interview invite draft with the exact link", async () => {
    const { candidate } = await seedBasics();
    const { processed } = await receive();
    expect(processed).toEqual({ category: "interested", drafted: ["interview_invite"] });
    expect((await getCandidate(candidate.id))!.stage).toBe("interested");
    const [invite] = await outbox();
    expect(invite).toMatchObject({ type: "interview_invite", status: "draft", interview_link: LINK });
    expect(invite!.html).toContain(`href="${LINK}"`);
    expect(invite!.text).toContain(LINK);
    const msg = (await db.query<{ category: string }>("select category from messages where direction = 'in'"))[0];
    expect(msg!.category).toBe("interested");
  });

  it("question -> question_pending + reply draft", async () => {
    const { candidate } = await seedBasics();
    const { processed } = await receive({ ExtractedMarkdownMessage: "What is the notice period you need?", RawTextBody: "" });
    expect(processed!.category).toBe("question");
    expect((await getCandidate(candidate.id))!.stage).toBe("question_pending");
    expect((await outbox()).map((o) => [o.type, o.reply_category])).toEqual([["reply", "question"]]);
  });

  it("not interested -> not_interested + gracious reply draft", async () => {
    const { candidate } = await seedBasics();
    await receive({ ExtractedMarkdownMessage: "Thanks, but I have accepted another offer." });
    expect((await getCandidate(candidate.id))!.stage).toBe("not_interested");
    expect((await outbox())[0]).toMatchObject({ type: "reply", reply_category: "not_interested" });
  });

  it("reschedule -> reschedule_requested + reply", async () => {
    const { candidate } = await seedBasics();
    await receive({ ExtractedMarkdownMessage: "Can we reschedule the interview to next week?" });
    expect((await getCandidate(candidate.id))!.stage).toBe("reschedule_requested");
  });

  it("other -> needs_hr, reply always needs review", async () => {
    const { candidate } = await seedBasics();
    await receive({ ExtractedMarkdownMessage: "My cousin also wants to know about stuff." });
    expect((await getCandidate(candidate.id))!.stage).toBe("needs_hr");
    expect((await outbox())[0]).toMatchObject({ type: "reply", reply_category: "other", status: "needs_review", approved: false });
  });

  it("AI classifier failure -> other (needs HR)", async () => {
    const { candidate } = await seedBasics();
    setAiProviderForTests({ name: "test", complete: async (t) => (t.kind === "classify_reply" ? { text: "??", model: "t" } : { text: '{"subject":"Senior Accountant","body":"x"}', model: "t" }) });
    const { processed } = await receive({ ExtractedMarkdownMessage: "Yes please" });
    expect(processed!.category).toBe("other");
    expect((await getCandidate(candidate.id))!.stage).toBe("needs_hr");
  });

  it("a reply cancels a waiting follow-up", async () => {
    const { candidate } = await seedBasics();
    await db.query("update candidates set stage = 'contacted' where id = $1", [candidate.id]);
    await createDraft({ candidateId: candidate.id, type: "followup", actor: "cron" });
    await receive({ ExtractedMarkdownMessage: "What is the notice period?" });
    const followup = (await outbox()).find((o) => o.type === "followup");
    expect(followup).toMatchObject({ status: "rejected", error: "The candidate replied" });
  });
});

describe("matching, duplicates, suppression", () => {
  it("matches by reply token when the sender address differs", async () => {
    const { candidate } = await seedBasics();
    const r = await ingestInbound(one(brevoPayload({ From: { Address: "asha.personal@example.com" }, To: [{ Address: `${candidate.reply_token}@reply.company.com` }] })));
    expect(r).toMatchObject({ kind: "pending", candidateId: candidate.id });
  });

  it("unknown senders go to the activity log", async () => {
    await seedBasics();
    const r = await ingestInbound(one(brevoPayload({ From: { Address: "stranger@example.org" } })));
    expect(r.kind).toBe("unknown_sender");
    expect(await db.query("select 1 from activity_log where action = 'inbound.unknown_sender'")).toHaveLength(1);
    expect(await db.query("select 1 from messages where category = 'unknown_sender' and candidate_id is null")).toHaveLength(1);
  });

  it("the same email delivered twice is stored once", async () => {
    await seedBasics();
    const p = brevoPayload();
    expect((await ingestInbound(one(p))).kind).toBe("pending");
    expect((await ingestInbound(one(p))).kind).toBe("duplicate");
    expect(await db.query("select 1 from messages where direction = 'in'")).toHaveLength(1);
  });

  it("auto-replies are stored but change nothing", async () => {
    const { candidate } = await seedBasics();
    await db.query("update candidates set stage = 'contacted' where id = $1", [candidate.id]);
    const { ingest } = await receive({ Subject: "Out of office", ExtractedMarkdownMessage: "I am on leave until Monday." });
    expect(ingest.kind).toBe("auto_reply");
    const c = (await getCandidate(candidate.id))!;
    expect(c.stage).toBe("contacted");
    expect(c.last_reply_at).toBeNull();
    expect(await outbox()).toHaveLength(0);
  });

  it("bounces add the address to suppression and cancel drafts", async () => {
    const { candidate } = await seedBasics();
    await createDraft({ candidateId: candidate.id, type: "outreach", actor: "cron" });
    const { ingest } = await receive({
      From: { Address: "mailer-daemon@mail.example.com" },
      Subject: "Undeliverable: Senior Accountant opportunity",
      ExtractedMarkdownMessage: "Delivery to asha@example.com failed permanently.",
    });
    expect(ingest.kind).toBe("bounce");
    expect(await db.query("select reason from suppression where email = 'asha@example.com'")).toEqual([{ reason: "bounce" }]);
    expect((await outbox())[0]!.status).toBe("rejected");
  });

  it("unsubscribe -> suppression, do-not-email, drafts cancelled", async () => {
    const { candidate } = await seedBasics();
    await createDraft({ candidateId: candidate.id, type: "outreach", actor: "cron" });
    await receive({ ExtractedMarkdownMessage: "Please stop emailing me." });
    expect(await db.query("select reason from suppression")).toEqual([{ reason: "unsubscribe" }]);
    const c = (await getCandidate(candidate.id))!;
    expect(c).toMatchObject({ do_not_email: true, stage: "not_interested" });
    expect((await outbox())[0]!.status).toBe("rejected");
    // And nothing new can be drafted for them.
    expect((await createDraft({ candidateId: candidate.id, type: "followup", actor: "cron" })).outcome).toBe("skipped");
  });

  it("pending replies are picked up by the safety net", async () => {
    await seedBasics();
    await ingestInbound(one(brevoPayload()));
    expect(await processPendingInbound()).toBe(1);
    expect(await processPendingInbound()).toBe(0);
  });
});

describe("secrets", () => {
  it("compares safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(hasBearer("Bearer s3cret", "s3cret")).toBe(true);
    expect(hasBearer("Bearer wrong", "s3cret")).toBe(false);
    expect(hasBearer(null, "s3cret")).toBe(false);
    expect(hasBearer("Bearer x", undefined)).toBe(false);
  });
});
