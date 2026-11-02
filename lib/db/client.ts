import { assertSafeToStart, ConfigError, env } from "@/lib/config/env";
import type { Db } from "./types";
import { migrate } from "./migrate";

type DbHolder = { db?: Promise<Db>; override?: Db };
const g = globalThis as unknown as { __hrDb?: DbHolder };
const holder: DbHolder = (g.__hrDb ??= {});

/**
 * Returns the shared database connection.
 * - MOCK_DB=true  -> PGlite (Postgres running inside Node). No accounts needed.
 * - otherwise     -> node-postgres using DATABASE_URL (your Supabase database).
 * Migrations are applied automatically on first use unless AUTO_MIGRATE=false.
 */
export function getDb(): Promise<Db> {
  if (holder.override) return Promise.resolve(holder.override);
  if (!holder.db) {
    holder.db = createDb().catch((err: unknown) => {
      holder.db = undefined; // allow a retry on the next request
      throw err;
    });
  }
  return holder.db;
}

async function createDb(): Promise<Db> {
  const e = env();
  assertSafeToStart(e);
  let db: Db;
  if (e.mockDb) {
    const { createPgliteDb } = await import("./pglite");
    db = await createPgliteDb(e.mockDbDir);
  } else {
    if (!e.databaseUrl) {
      throw new ConfigError(
        "DATABASE_URL is not set. Add your Supabase connection string (see START_HERE.md, step 1), or set MOCK_DB=true for a local demo.",
      );
    }
    const { createPgDb } = await import("./pg");
    db = createPgDb(e.databaseUrl);
  }
  if (e.mockDb || e.autoMigrate) await migrate(db);
  return db;
}

/** Tests use this to plug in their own database. */
export function setDbForTests(db: Db | undefined): void {
  holder.override = db;
}
