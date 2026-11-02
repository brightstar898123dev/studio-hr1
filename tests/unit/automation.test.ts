import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { freshDb } from "../helpers/db";
import { LINK, seedBasics } from "../helpers/seed";
import { runOutreach, runStageEmails } from "@/lib/automation/stages";
import { runDailyDigest, collectDigest } from "@/lib/digest/build";
import { createCandidate, updateCandidate } from "@/lib/data/candidates";
import { updateJob } from "@/lib/data/jobs";
import { updateSettings } from "@/lib/data/settings";
import { reject } from "@/lib/outbox/operations";
import { setMailerForTests, type Mailer, type MailMessage } from "@/lib/mail";
import { CandidateSchema } from "@/lib/validation";
import type { Db } from "@/lib/db/types";
import type { OutboxRow } from "@/lib/types";

let db: Db;
let mails: MailMessage[];
const recorder: Mailer = { name: "test", send: async (m) => (mails.push(m), { messageId: `id-${mails.length}`, mock: true }) };
beforeEach(async () => {
  db = await freshDb();
  mails = [];
  setMailerForTests(recorder);
});
afterEach(() => setMailerForTests(undefined));
const outbox = () => db.query<OutboxRow>("select * from outbox order by created_at");

describe("outreach", () => {
  it("drafts new candidates up to the batch size and is safe to re-run", async () => {
    const { job } = await seedBasics();
    for (let i = 0; i < 4; i++) await createCandidate(CandidateSchema.parse({ name: `Cand${i} X`, email: `c${i}@example.com`, job_id: job.id }));
    await updateSettings({ outreach_batch_size: 3 });
    expect((await runOutreach()).drafted).toBe(3);
    expect((await runOutreach()).drafted).toBe(0); // batch used up today
    expect((await outbox()).every((o) => o.type === "outreach" && o.status === "draft")).toBe(true);
  });

  it("skips paused/closed jobs and paused candidates", async () => {
    const { job, candidate } = await seedBasics();
    await updateJob(job.id, { status: "paused" });
    expect((await runOutreach()).drafted).toBe(0);
    await updateJob(job.id, { status: "open" });
    await updateCandidate(candidate.id, { stage: "paused" });
    expect((await runOutreach()).drafted).toBe(0);
  });

  it("stops early when the time budget is used up and reports not done", async () => {
    await seedBasics();
    const res = await runOutreach({ deadline: Date.now() - 1 });
    expect(res).toMatchObject({ done: false, stoppedBecause: "time", drafted: 0 });
  });

  it("does not redraft an email HR rejected", async () => {
    await seedBasics();
    await runOutreach();
    await reject((await outbox())[0]!.id);
    await db.query("delete from outbox where status = 'draft'");
    await db.query("update outbox set created_at = now() - interval '2 days'");
    expect((await runOutreach()).drafted).toBe(0);
  });
});

describe("stage emails", () => {
  it("interested -> invite with the exact link, then sends approved emails at the end", async () => {
    const { candidate } = await seedBasics({ autoSend: true });
    await updateCandidate(candidate.id, { stage: "interested" });
    const res = await runStageEmails();
    expect(res.drafted).toBe(1);
    expect(res.send?.sent).toBe(1); // auto-approved, then sent by the same run
    expect(mails[0]!.html).toContain(`href="${LINK}"`);
    expect((await db.query<{ stage: string }>("select stage from candidates"))[0]!.stage).toBe("interview_invited");
  });

  it("follow-up after followup_days with no reply, up to max_followups", async () => {
    const { candidate } = await seedBasics();
    await updateSettings({ followup_days: 3, max_followups: 2 });
    await db.query("update candidates set stage = 'contacted', last_contacted_at = now() - interval '1 day' where id = $1", [candidate.id]);
    expect((await runStageEmails()).drafted).toBe(0); // too soon
    await db.query("update candidates set last_contacted_at = now() - interval '4 days' where id = $1", [candidate.id]);
    expect((await runStageEmails()).drafted).toBe(1);
    expect((await outbox())[0]!.type).toBe("followup");
    // Already at the max: nothing more.
    await db.query("delete from outbox");
    await db.query("update candidates set followup_count = 2 where id = $1", [candidate.id]);
    expect((await runStageEmails()).drafted).toBe(0);
  });

  it("no follow-up if the candidate replied after our last email", async () => {
    const { candidate } = await seedBasics();
    await db.query(
      "update candidates set stage = 'contacted', last_contacted_at = now() - interval '5 days', last_reply_at = now() - interval '4 days' where id = $1",
      [candidate.id],
    );
    expect((await runStageEmails()).drafted).toBe(0);
  });

  it("follow-up after an invite carries the interview link", async () => {
    const { candidate } = await seedBasics();
    await db.query("update candidates set stage = 'interview_invited', last_contacted_at = now() - interval '4 days' where id = $1", [candidate.id]);
    await runStageEmails();
    const [f] = await outbox();
    expect(f).toMatchObject({ type: "followup", status: "draft", interview_link: LINK });
    expect(f!.html).toContain(`href="${LINK}"`);
  });

  it("interviewed + HR notes -> feedback; decision stated only when set", async () => {
    const { candidate } = await seedBasics();
    await updateCandidate(candidate.id, { stage: "interviewed" });
    expect((await runStageEmails()).drafted).toBe(0); // no notes yet
    await updateCandidate(candidate.id, { hr_notes: "Strong Excel skills, clear communicator." });
    await runStageEmails();
    const [fb] = await outbox();
    expect(fb).toMatchObject({ type: "feedback", status: "draft" });
    expect(fb!.text).toMatch(/HR will share an update/);
    expect(fb!.text).not.toMatch(/moving to the next stage|not be moving forward/);

    await db.query("delete from outbox");
    await updateCandidate(candidate.id, { decision: "move_forward" });
    await runStageEmails();
    expect((await outbox())[0]!.text).toMatch(/moving to the next stage/);
  });

  it("link_missing candidates are retried once a link is added", async () => {
    const { job, candidate } = await seedBasics({ link: null });
    await updateCandidate(candidate.id, { stage: "interested" });
    await runStageEmails();
    expect((await outbox())[0]!.status).toBe("link_missing");
    await updateJob(job.id, { interview_link: "https://interview.example.com/added" });
    await runStageEmails();
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "interview_invite", status: "draft", interview_link: "https://interview.example.com/added" });
  });
});

describe("daily digest", () => {
  it("summarises the day and is sent once per day", async () => {
    const { candidate } = await seedBasics();
    await runOutreach();
    await db.query("insert into messages (candidate_id, direction, subject, category) values ($1, 'in', 'Re: role', 'interested')", [candidate.id]);
    await db.query("insert into messages (direction, from_email, subject, category) values ('in', 'stranger@example.org', 'Hello', 'unknown_sender')");
    await db.query("insert into ai_usage (date, model, requests) values (current_date, 'mock', 3) on conflict do nothing");

    const data = await collectDigest();
    expect(data).toMatchObject({ draftsWaiting: 1, sentToday: 0 });
    expect(data.replies).toEqual([{ candidate: "Asha Rao", category: "interested", subject: "Re: role" }]);
    expect(data.unknownSenders).toEqual([{ from: "stranger@example.org", subject: "Hello" }]);

    const res = await runDailyDigest();
    expect(res).toMatchObject({ sent: true, to: "hr@company.com" });
    expect(mails).toHaveLength(1);
    const m = mails[0]!;
    expect(m.subject).toMatch(/1 to approve/);
    for (const s of ["Drafts to approve: 1", "Asha Rao: interested", "stranger@example.org", "Candidates by stage", "AI usage today", "Sent today: 0 of 100"]) {
      expect(m.text).toContain(s);
    }
    expect(m.text).not.toContain("unsubscribe");
    expect((await runDailyDigest()).sent).toBe(false);
    expect((await runDailyDigest({ force: true })).sent).toBe(true);
  });
});
