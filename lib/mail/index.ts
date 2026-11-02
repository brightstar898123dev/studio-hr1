import { randomUUID } from "node:crypto";
import { env } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import { createBrevoMailer } from "./brevo";
import { MailError, type Mailer, type MailMessage, type MailResult } from "./types";

/** MOCK_EMAIL=true: nothing leaves the app; the email is stored in mail_log. */
const mockMailer: Mailer = {
  name: "mock",
  async send() {
    return { messageId: `mock-${randomUUID()}`, mock: true };
  },
};

let override: Mailer | undefined;
export function setMailerForTests(m: Mailer | undefined): void {
  override = m;
}

function mailer(): Mailer {
  if (override) return override;
  const e = env();
  if (e.mockEmail) return mockMailer;
  if (!e.brevoApiKey) throw new MailError("BREVO_API_KEY is not set, so emails cannot be sent. Add it, or set MOCK_EMAIL=true for testing.", undefined, true);
  return createBrevoMailer({ apiKey: e.brevoApiKey });
}

/** Sends one email and records it in mail_log (real or mock). */
export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const result = await mailer().send(msg);
  const db = await getDb();
  await db.query(
    "insert into mail_log (to_email, subject, html, text, kind, mock, provider_id) values ($1, $2, $3, $4, $5, $6, $7)",
    [msg.to.email, msg.subject, msg.html, msg.text, msg.kind, result.mock, result.messageId],
  );
  return result;
}

export { MailError };
export type { MailMessage, MailResult, Mailer };
