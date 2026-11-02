/** Minimal database interface shared by node-postgres (production) and PGlite (mock mode, tests). */
export interface Queryable {
  /** Run one parameterised statement ($1, $2, ...) and return the rows. */
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** Run one or more statements without parameters (used for migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  readonly kind: "pg" | "pglite";
  /** Run fn inside a transaction. Rolls back if fn throws. */
  tx<R>(fn: (q: Queryable) => Promise<R>): Promise<R>;
  close(): Promise<void>;
}

/**
 * Postgres returns timestamps like "2026-11-02 14:28:01.123456+00".
 * We always hand ISO strings ("2026-11-02T14:28:01.123Z") to the app.
 */
export function pgTimestampToIso(value: string): string {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(?:([+-])(\d{2})(?::?(\d{2}))?(?::?(\d{2}))?|Z)?$/);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  const [, date, time, frac, sign, hh, mm, ss] = m;
  const ms = frac ? frac.slice(0, 4).padEnd(4, "0") : ".000";
  const offset = sign ? `${sign}${hh}:${mm ?? "00"}` : "Z";
  const d = new Date(`${date}T${time}${ms}${offset}`);
  if (ss && sign) {
    // Offsets with seconds (historic time zones) - adjust manually.
    const secs = Number(ss) * (sign === "+" ? -1 : 1);
    d.setUTCSeconds(d.getUTCSeconds() + secs);
  }
  return d.toISOString();
}

// Postgres type ids we normalise.
export const PG_TYPES = {
  INT8: 20,
  NUMERIC: 1700,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  DATE: 1082,
} as const;
