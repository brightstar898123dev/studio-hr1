import { env } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import { dateInTz } from "@/lib/time";

/** Counts one AI request and returns today's total (all models). */
export async function bumpAiUsage(model: string): Promise<number> {
  const db = await getDb();
  const rows = await db.query<{ total: number }>("select bump_ai_usage($1::date, $2) as total", [dateInTz(env().timezone), model]);
  return rows[0]?.total ?? 0;
}

export async function aiUsageToday(): Promise<number> {
  const db = await getDb();
  const rows = await db.query<{ n: number }>("select coalesce(sum(requests), 0)::int as n from ai_usage where date = $1::date", [
    dateInTz(env().timezone),
  ]);
  return rows[0]?.n ?? 0;
}

export async function aiUsageLastDays(days = 7): Promise<{ date: string; model: string; requests: number }[]> {
  const db = await getDb();
  return db.query(
    "select to_char(date, 'YYYY-MM-DD') as date, model, requests from ai_usage where date >= ($1::date - $2::int) order by date desc, model",
    [dateInTz(env().timezone), days - 1],
  );
}

/** AI requests left today (Infinity in mock mode). Automation stops drafting when this runs low. */
export async function aiBudgetLeft(): Promise<number> {
  const e = env();
  if (e.mockAi) return Number.POSITIVE_INFINITY;
  return e.aiDailyLimit - (await aiUsageToday());
}
