import { after, NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import { logActivity } from "@/lib/activity";
import { safeEqual } from "@/lib/http/secrets";
import { ingestInbound, processInboundMessage } from "@/lib/inbound/handle";
import { InboundPayloadError, parseBrevoInbound } from "@/lib/inbound/parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Brevo inbound parsing webhook. The secret is part of the URL:
 *   <APP_URL>/api/webhooks/brevo-inbound/<INBOUND_WEBHOOK_SECRET>
 * Replies are stored straight away; AI classification and drafting run right
 * after the response (and the hourly job retries anything left over).
 */
export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  const expected = env().inboundWebhookSecret;
  if (!expected || !safeEqual(secret, expected)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  let emails;
  try {
    emails = parseBrevoInbound(payload);
  } catch (err) {
    const message = err instanceof InboundPayloadError ? err.message : "Invalid payload";
    await logActivity({ actor: "webhook", action: "inbound.invalid_payload", details: { error: message } });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const pending: string[] = [];
  const results: string[] = [];
  let failures = 0;
  for (const email of emails) {
    try {
      const r = await ingestInbound(email);
      results.push(r.kind);
      if (r.kind === "pending") pending.push(r.messageId);
    } catch (err) {
      failures++;
      await logActivity({ actor: "webhook", action: "inbound.error", details: { error: err instanceof Error ? err.message : String(err), from: email.from.email } });
    }
  }
  // Nothing could be stored: ask Brevo to retry later (duplicates are ignored).
  if (failures === emails.length) return NextResponse.json({ error: "Could not store the email" }, { status: 500 });

  after(async () => {
    for (const id of pending) {
      try {
        await processInboundMessage(id);
      } catch (err) {
        await logActivity({ actor: "webhook", action: "inbound.process_error", entity: "message", entityId: id, details: { error: err instanceof Error ? err.message : String(err) } });
      }
    }
  });

  return NextResponse.json({ ok: true, received: emails.length, results });
}
