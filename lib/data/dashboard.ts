import { aiUsageToday } from "@/lib/ai/usage";
import { env } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import type { ActivityRow } from "@/lib/types";

export type DashboardData = {
  draftsWaiting: number;
  needsReview: number;
  linkMissing: number;
  failed: number;
  repliesToday: number;
  sentToday: number;
  aiToday: number;
  aiLimit: number;
  stageCounts: Record<string, number>;
  recent: ActivityRow[];
  jobs: number;
  candidates: number;
  settingsReady: boolean;
  templatesOrSent: number;
};

export async function getDashboard(): Promise<DashboardData> {
  const db = await getDb();
  const e = env();
  const dayStart = "(date_trunc('day', now() at time zone $1) at time zone $1)";
  const [statusCounts, replies, sent, stages, recent, counts, settings, ai] = await Promise.all([
    db.query<{ status: string; n: number }>("select status, count(*)::int as n from outbox group by status"),
    db.query<{ n: number }>(`select count(*)::int as n from messages where direction = 'in' and candidate_id is not null and created_at >= ${dayStart}`, [e.timezone]),
    db.query<{ n: number }>("select sent_today_count($1) as n", [e.timezone]),
    db.query<{ stage: string; n: number }>("select stage, count(*)::int as n from candidates group by stage"),
    db.query<ActivityRow>("select * from activity_log order by created_at desc limit 12"),
    db.query<{ jobs: number; candidates: number; mails: number }>(
      "select (select count(*)::int from jobs) as jobs, (select count(*)::int from candidates) as candidates, (select count(*)::int from mail_log) as mails",
    ),
    db.query<{ sender_email: string; hr_digest_email: string | null; company_name: string }>("select sender_email, hr_digest_email, company_name from settings where id = 1"),
    aiUsageToday(),
  ]);
  const by = (s: string) => statusCounts.find((c) => c.status === s)?.n ?? 0;
  const st = settings[0];
  return {
    draftsWaiting: by("draft"),
    needsReview: by("needs_review"),
    linkMissing: by("link_missing"),
    failed: by("failed"),
    repliesToday: replies[0]?.n ?? 0,
    sentToday: sent[0]?.n ?? 0,
    aiToday: ai,
    aiLimit: e.aiDailyLimit,
    stageCounts: Object.fromEntries(stages.map((s) => [s.stage, s.n])),
    recent,
    jobs: counts[0]?.jobs ?? 0,
    candidates: counts[0]?.candidates ?? 0,
    settingsReady: !!st?.sender_email && st.company_name !== "Your Company",
    templatesOrSent: counts[0]?.mails ?? 0,
  };
}
