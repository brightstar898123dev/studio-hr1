/**
 * Integration tests against a real Postgres server (many connections, real concurrency).
 * Runs only when TEST_DATABASE_URL is set, e.g.
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test
 * WARNING: it drops and recreates the "public" schema of that database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgDb } from "@/lib/db/pg";
import { migrate } from "@/lib/db/migrate";
import type { Db } from "@/lib/db/types";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("real Postgres", () => {
  let db: Db;

  beforeAll(async () => {
    db = createPgDb(url!);
    await db.exec("drop schema if exists public cascade; create schema public; grant all on schema public to public;");
    await migrate(db);
  });

  afterAll(async () => {
    await db?.close();
  });

  it("re-running migrations applies nothing", async () => {
    expect(await migrate(db)).toEqual([]);
  });

  async function approvedRows(n: number): Promise<string[]> {
    const [c] = await db.query<{ id: string }>(
      "insert into candidates (name, email) values ('Asha', $1) returning id",
      [`asha.${Math.random().toString(36).slice(2)}@example.com`],
    );
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const types = ["outreach", "interview_invite", "followup", "feedback", "reply"];
      const [row] = await db.query<{ id: string }>(
        `insert into outbox (candidate_id, type, to_email, subject, status, approved)
         values ($1, $2, 'asha@example.com', 'Hi', 'approved', true) returning id`,
        [c!.id, types[i % types.length]],
      );
      ids.push(row!.id);
    }
    return ids;
  }

  it("20 concurrent claims of the same email: exactly one wins", async () => {
    const [id] = await approvedRows(1);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => db.query("select * from claim_outbox_for_send($1, 1000, 'Asia/Kolkata')", [id])),
    );
    expect(results.filter((r) => r.length === 1)).toHaveLength(1);
  });

  it("daily limit holds under concurrency", async () => {
    await db.exec("delete from outbox");
    const ids = await approvedRows(5);
    const results = await Promise.all(
      ids.map((id) => db.query("select * from claim_outbox_for_send($1, 3, 'Asia/Kolkata')", [id])),
    );
    expect(results.filter((r) => r.length === 1)).toHaveLength(3);
  });

  it("anonymous role cannot read candidates (RLS / grants)", async () => {
    await expect(
      db.tx(async (q) => {
        await q.exec("set local role anon");
        return q.query("select * from candidates");
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("authenticated role can read candidates", async () => {
    const rows = await db.tx(async (q) => {
      await q.exec("grant select on all tables in schema public to authenticated");
      await q.exec("set local role authenticated");
      return q.query("select * from candidates");
    });
    expect(Array.isArray(rows)).toBe(true);
  });
});
