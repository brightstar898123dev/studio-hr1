import { runCron } from "@/lib/cron/handler";
import { runOutreach } from "@/lib/automation/stages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Weekdays 10:00 IST: drafts first outreach emails for new candidates (batch size from Settings). */
export async function POST(req: Request) {
  return runCron(req, "outreach", ({ deadline }) => runOutreach({ deadline }));
}
