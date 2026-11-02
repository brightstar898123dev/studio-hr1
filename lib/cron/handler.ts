import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";
import { env } from "@/lib/config/env";
import { hasBearer } from "@/lib/http/secrets";

/** How long one cron call may work before handing over to the next call (Vercel Hobby limit is 60s). */
export const TIME_BUDGET_MS = 45_000;

/**
 * Wraps a scheduled job: checks "Authorization: Bearer <CRON_SECRET>", runs it,
 * logs the result, and always answers JSON. Jobs return { done } so the GitHub
 * workflow knows whether to call again.
 */
export async function runCron<T extends object>(
  req: Request,
  name: string,
  job: (ctx: { deadline: number; url: URL }) => Promise<T>,
): Promise<Response> {
  const secret = env().cronSecret;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set on the server." }, { status: 500 });
  if (!hasBearer(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const result = await job({ deadline: started + TIME_BUDGET_MS, url: new URL(req.url) });
    const done = "done" in result ? (result as { done: boolean }).done : true;
    return NextResponse.json({ ok: true, job: name, done, ms: Date.now() - started, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logActivity({ actor: "cron", action: `cron.${name}.error`, details: { error: message } });
    return NextResponse.json({ ok: false, job: name, done: true, error: message }, { status: 500 });
  }
}
