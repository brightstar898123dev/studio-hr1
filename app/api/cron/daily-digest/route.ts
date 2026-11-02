import { runCron } from "@/lib/cron/handler";
import { runDailyDigest } from "@/lib/digest/build";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 19:00 IST: emails HR the daily summary. Add ?force=1 to send again the same day. */
export async function POST(req: Request) {
  return runCron(req, "daily-digest", async ({ url }) => {
    const r = await runDailyDigest({ force: url.searchParams.get("force") === "1" });
    return { done: true, sent: r.sent, to: r.to, reason: r.reason, subject: r.subject };
  });
}
