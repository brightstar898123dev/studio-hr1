import { LOCAL_SHIM_SQL, MIGRATIONS } from "./migrations.generated";
import type { Db } from "./types";

/**
 * Applies any migrations from supabase/migrations that have not run yet.
 * Safe to call on every start: it takes a lock and skips migrations already applied.
 * Returns the names of migrations applied in this call.
 */
export async function migrate(db: Db): Promise<string[]> {
  return db.tx(async (q) => {
    await q.query("select pg_advisory_xact_lock(hashtext('hr_app_migrations'))");
    await q.exec(
      "create table if not exists public._app_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    // Supabase has these roles already. Plain Postgres / PGlite need stand-ins.
    const roles = await q.query<{ n: number }>(
      "select count(*)::int as n from pg_roles where rolname in ('anon', 'authenticated')",
    );
    if ((roles[0]?.n ?? 0) < 2) await q.exec(LOCAL_SHIM_SQL);

    const done = new Set(
      (await q.query<{ name: string }>("select name from public._app_migrations")).map((r) => r.name),
    );
    const applied: string[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      await q.exec(m.sql);
      await q.query("insert into public._app_migrations (name) values ($1)", [m.name]);
      applied.push(m.name);
    }
    return applied;
  });
}
