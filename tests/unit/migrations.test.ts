import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createPgliteDb } from "@/lib/db/pglite";
import { migrate } from "@/lib/db/migrate";

describe("migrations", () => {
  it("bundle is in sync with supabase/migrations", () => {
    expect(() => execFileSync("node", ["scripts/bundle-migrations.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("apply cleanly and are idempotent", async () => {
    const db = await createPgliteDb("memory");
    const first = await migrate(db);
    expect(first.length).toBeGreaterThan(0);
    expect(await migrate(db)).toEqual([]);
    const s = await db.query<{ id: number; followup_days: number; auto_send: boolean }>("select * from settings");
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: 1, followup_days: 3, auto_send: false });
    await db.close();
  });

  it("enables row level security on every app table", async () => {
    const db = await createPgliteDb("memory");
    await migrate(db);
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname <> '_app_migrations'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (const r of rows) expect(r.relrowsecurity, r.relname).toBe(true);
    await db.close();
  });

  it("candidate emails are unique regardless of case", async () => {
    const db = await createPgliteDb("memory");
    await migrate(db);
    await db.query("insert into candidates (name, email) values ('A', 'Asha@Example.com')");
    await expect(db.query("insert into candidates (name, email) values ('B', 'asha@example.COM')")).rejects.toThrow();
    await db.close();
  });
});
