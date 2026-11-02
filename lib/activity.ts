import { getDb } from "@/lib/db/client";
import type { Queryable } from "@/lib/db/types";

export type Actor = "hr" | "system" | "cron" | "webhook";

export type ActivityInput = {
  actor: Actor;
  action: string;
  entity?: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
};

/** Writes one line to the activity log. Never throws (logging must not break the real work). */
export async function logActivity(input: ActivityInput, q?: Queryable): Promise<void> {
  try {
    const db = q ?? (await getDb());
    await db.query(
      "insert into activity_log (actor, action, entity, entity_id, details) values ($1, $2, $3, $4, $5)",
      [input.actor, input.action, input.entity ?? null, input.entityId ?? null, JSON.stringify(input.details ?? {})],
    );
  } catch (err) {
    console.error("[activity] failed to log", input.action, err);
  }
}
