import { runCron } from "@/lib/cron/handler";
import { runStageEmails } from "@/lib/automation/stages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Hourly 09:00-18:00 IST: invites, follow-ups, feedback, waiting replies; then sends approved emails. */
export async function POST(req: Request) {
  return runCron(req, "stage-emails", ({ deadline }) => runStageEmails({ deadline }));
}
