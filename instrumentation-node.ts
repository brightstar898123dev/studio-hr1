import { assertSafeToStart, env } from "@/lib/config/env";

/**
 * Refuses to start in production with the demo database, then warms up the
 * database connection (which also applies any pending migrations).
 */
export async function onServerStart(): Promise<void> {
  const e = env();
  try {
    assertSafeToStart(e);
  } catch (err) {
    console.error(`\n[startup] Refusing to start: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
  if (e.isBuildPhase) return;
  if (e.mockDb || e.databaseUrl) {
    const { getDb } = await import("@/lib/db/client");
    try {
      await getDb();
    } catch (err) {
      console.error("[startup] Database not ready:", err instanceof Error ? err.message : err);
    }
  }
}
