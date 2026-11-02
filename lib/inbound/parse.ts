import { z } from "zod";

/**
 * Brevo inbound parsing webhook payload: { "items": [ { Uuid, MessageId, InReplyTo,
 * From: {Name, Address}, To: [{Name, Address}], Subject, RawTextBody, RawHtmlBody,
 * ExtractedMarkdownMessage, Headers, ... } ] }.
 * We accept PascalCase or camelCase keys and a single item without "items", so a
 * small format change on Brevo's side does not lose replies.
 */

export type InboundEmail = {
  externalId: string;
  messageId: string | null;
  inReplyTo: string | null;
  from: { email: string; name: string | null };
  to: string[];
  subject: string;
  text: string;
  html: string | null;
  headers: Record<string, string>;
  raw: unknown;
};

const Address = z
  .object({ Address: z.string().optional(), address: z.string().optional(), Name: z.string().nullish(), name: z.string().nullish() })
  .passthrough();

function pick<T = unknown>(o: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) return o[k] as T;
  }
  return undefined;
}

function addr(v: unknown): { email: string; name: string | null } | null {
  if (typeof v === "string") {
    const m = v.match(/<([^>]+)>/);
    return { email: (m ? m[1]! : v).trim().toLowerCase(), name: m ? v.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "") || null : null };
  }
  const p = Address.safeParse(v);
  if (!p.success) return null;
  const email = (p.data.Address ?? p.data.address ?? "").trim().toLowerCase();
  return email ? { email, name: (p.data.Name ?? p.data.name ?? null) || null } : null;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function headersOf(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k.toLowerCase()] = Array.isArray(val) ? val.map(String).join(", ") : String(val ?? "");
    }
  }
  return out;
}

export class InboundPayloadError extends Error {}

export function parseBrevoInbound(payload: unknown): InboundEmail[] {
  if (!payload || typeof payload !== "object") throw new InboundPayloadError("Payload is not a JSON object.");
  const root = payload as Record<string, unknown>;
  const items = Array.isArray(root.items) ? root.items : Array.isArray(root.Items) ? root.Items : [root];
  if (items.length === 0) throw new InboundPayloadError("Payload has no items.");
  if (items.length > 50) throw new InboundPayloadError("Too many items in one payload.");

  return items.map((item, i) => {
    if (!item || typeof item !== "object") throw new InboundPayloadError(`Item ${i} is not an object.`);
    const o = item as Record<string, unknown>;
    const from = addr(pick(o, "From", "from"));
    if (!from) throw new InboundPayloadError(`Item ${i} has no sender address.`);
    const toRaw = pick<unknown>(o, "To", "to", "Recipients", "recipients");
    const toList = (Array.isArray(toRaw) ? toRaw : toRaw ? [toRaw] : []).map(addr).filter(Boolean).map((a) => a!.email);
    const uuid = pick<unknown>(o, "Uuid", "uuid", "UUID");
    const messageId = pick<string>(o, "MessageId", "messageId", "Message-Id") ?? null;
    const html = pick<string>(o, "RawHtmlBody", "rawHtmlBody", "HtmlBody", "html") ?? null;
    const text =
      pick<string>(o, "ExtractedMarkdownMessage", "extractedMarkdownMessage") ??
      pick<string>(o, "RawTextBody", "rawTextBody", "TextBody", "text") ??
      (html ? htmlToText(html) : "");
    const externalId = (Array.isArray(uuid) ? String(uuid[0] ?? "") : typeof uuid === "string" ? uuid : "") || messageId || "";
    if (!externalId) throw new InboundPayloadError(`Item ${i} has no Uuid or MessageId.`);
    return {
      externalId,
      messageId,
      inReplyTo: pick<string>(o, "InReplyTo", "inReplyTo") ?? null,
      from,
      to: toList,
      subject: (pick<string>(o, "Subject", "subject") ?? "").slice(0, 500),
      text: text.slice(0, 50_000),
      html: html ? html.slice(0, 200_000) : null,
      headers: headersOf(pick(o, "Headers", "headers")),
      raw: item,
    };
  });
}
