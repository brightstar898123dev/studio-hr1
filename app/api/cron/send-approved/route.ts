import { runCron } from "@/lib/cron/handler";
import { sendApproved } from "@/lib/sender/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every 30 minutes: sends approved emails (idempotent, respects the daily limit). */
export async function POST(req: Request) {
  return runCron(req, "send-approved", async () => ({ done: true, ...(await sendApproved({ actor: "cron" })) }));
}
