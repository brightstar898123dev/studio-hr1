import { getDb } from "@/lib/db/client";
import type { OutboxStatus } from "@/lib/types";

export type TimelineItem = {
  id: string;
  kind: "in" | "out" | "draft";
  subject: string | null;
  text: string | null;
  category: string | null;
  status: OutboxStatus | null;
  type: string | null;
  at: string;
};

/** Everything that happened with a candidate: received, sent and waiting emails. */
export async function getTimeline(candidateId: string): Promise<TimelineItem[]> {
  const db = await getDb();
  return db.query<TimelineItem>(
    `select id, direction as kind, subject, body_text as text, category, null::text as status, null::text as type, created_at as at
       from messages where candidate_id = $1
     union all
     select id, 'draft' as kind, subject, text, reply_category as category, status, type, created_at as at
       from outbox where candidate_id = $1 and status not in ('sent')
     order by at desc
     limit 200`,
    [candidateId],
  );
}
