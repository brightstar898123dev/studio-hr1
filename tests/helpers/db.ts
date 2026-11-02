import { createPgliteDb } from "@/lib/db/pglite";
import { migrate } from "@/lib/db/migrate";
import { setDbForTests } from "@/lib/db/client";
import type { Db } from "@/lib/db/types";

/** A fresh in-memory Postgres (PGlite) with all migrations applied, wired in as the app database. */
export async function freshDb(): Promise<Db> {
  const db = await createPgliteDb("memory");
  await migrate(db);
  setDbForTests(db);
  return db;
}
