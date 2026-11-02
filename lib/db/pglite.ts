import { PGlite, type Transaction } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { mkdirSync } from "node:fs";
import { PG_TYPES, pgTimestampToIso, type Db, type Queryable } from "./types";

const parsers = {
  [PG_TYPES.INT8]: (v: string) => Number.parseInt(v, 10),
  [PG_TYPES.NUMERIC]: (v: string) => Number.parseFloat(v),
  [PG_TYPES.TIMESTAMP]: (v: string) => pgTimestampToIso(v),
  [PG_TYPES.TIMESTAMPTZ]: (v: string) => pgTimestampToIso(v),
  [PG_TYPES.DATE]: (v: string) => v,
};

/**
 * Postgres running inside Node (WebAssembly). Used for MOCK_DB=true and tests.
 * dir = "memory" keeps everything in memory; otherwise data is saved in that folder.
 */
export async function createPgliteDb(dir: string = "memory"): Promise<Db> {
  const inMemory = dir === "memory" || dir === "memory://";
  if (!inMemory) mkdirSync(dir, { recursive: true });
  const pglite = await PGlite.create({
    dataDir: inMemory ? undefined : dir,
    extensions: { citext },
    parsers,
  });

  const wrap = (c: PGlite | Transaction): Queryable => ({
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const res = await c.query<T>(sql, params as unknown[]);
      return res.rows;
    },
    async exec(sql: string) {
      await c.exec(sql);
    },
  });

  const base = wrap(pglite);
  return {
    kind: "pglite",
    query: base.query,
    exec: base.exec,
    tx: (fn) => pglite.transaction((t) => fn(wrap(t))),
    close: () => pglite.close(),
  };
}
