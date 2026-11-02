import pg from "pg";
import { PG_TYPES, pgTimestampToIso, type Db, type Queryable } from "./types";

const types = {
  getTypeParser(oid: number, format?: string) {
    if (format === "binary") return pg.types.getTypeParser(oid, "binary");
    switch (oid) {
      case PG_TYPES.INT8:
        return (v: string) => Number.parseInt(v, 10);
      case PG_TYPES.NUMERIC:
        return (v: string) => Number.parseFloat(v);
      case PG_TYPES.TIMESTAMP:
      case PG_TYPES.TIMESTAMPTZ:
        return (v: string) => pgTimestampToIso(v);
      case PG_TYPES.DATE:
        return (v: string) => v;
      default:
        return pg.types.getTypeParser(oid, "text");
    }
  },
};

function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * node-postgres pool for the Supabase database.
 * Use the "Transaction pooler" connection string from Supabase (port 6543) on Vercel.
 */
export function createPgDb(databaseUrl: string): Db {
  const url = new URL(databaseUrl);
  // We set SSL ourselves; sslmode in the URL would override it.
  url.searchParams.delete("sslmode");
  const pool = new pg.Pool({
    connectionString: url.toString(),
    // Supabase uses its own certificate authority, so we encrypt but do not verify the chain.
    ssl: isLocalHost(databaseUrl) ? false : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    types,
  });

  const wrap = (c: pg.Pool | pg.PoolClient): Queryable => ({
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const res = await c.query(sql, params as unknown[]);
      return res.rows as T[];
    },
    async exec(sql: string) {
      await c.query(sql);
    },
  });

  const base = wrap(pool);
  return {
    kind: "pg",
    query: base.query,
    exec: base.exec,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn(wrap(client));
        await client.query("commit");
        return out;
      } catch (err) {
        await client.query("rollback").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
