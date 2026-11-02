import type { InboundEmail } from "./parse";

/** Out-of-office and other automatic replies. They never change a candidate's stage. */
export function isAutoReply(e: Pick<InboundEmail, "subject" | "headers" | "text">): boolean {
  const h = e.headers;
  const auto = (h["auto-submitted"] ?? "").toLowerCase();
  if (auto && auto !== "no") return true;
  if (h["x-autoreply"] || h["x-autorespond"] || h["x-auto-response-suppress"]?.toLowerCase().includes("all")) return true;
  if (/^(auto_reply|bulk|junk)$/i.test((h["precedence"] ?? "").trim())) return true;
  const s = e.subject.toLowerCase();
  if (/^(auto(matic)?[ -]?(reply|response)|out of (the )?office|ooo\b|away from (the )?office|on leave|on vacation|abwesenheit|absence|réponse automatique|autosvar)/i.test(s))
    return true;
  if (/^auto:/i.test(s)) return true;
  return /\b(i am|i'm|i will be) (currently )?(out of (the )?office|on (annual )?leave|on vacation|away)\b.*\b(return|back)\b/i.test(e.text.slice(0, 600));
}

/** Delivery failure notices (bounces). */
export function isBounce(e: Pick<InboundEmail, "from" | "subject" | "headers">): boolean {
  if (/^(mailer-daemon|postmaster|mail-daemon|bounce[s]?)@/i.test(e.from.email)) return true;
  if ((e.headers["content-type"] ?? "").includes("report-type=delivery-status")) return true;
  return /\b(undeliverable|undelivered mail|delivery status notification \(failure\)|mail delivery (failed|subsystem)|returned mail|delivery failure|failure notice|could not be delivered)\b/i.test(
    e.subject,
  );
}

/** Explicit requests to stop emails. */
export function isUnsubscribe(e: Pick<InboundEmail, "subject" | "text">): boolean {
  const firstLines = `${e.subject}\n${e.text.split("\n").slice(0, 6).join("\n")}`.toLowerCase();
  return /\b(unsubscribe|stop emailing|stop sending|remove me|take me off|do not (contact|email) me|don'?t (contact|email) me|opt[ -]?out)\b/.test(firstLines);
}

/** Email addresses mentioned in a bounce, to find which candidate it was about. */
export function emailsIn(text: string): string[] {
  return [...new Set([...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)].map((m) => m[0].toLowerCase()))];
}
