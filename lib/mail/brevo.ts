import { MailError, type Mailer, type MailMessage } from "./types";

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type BrevoOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

/** Brevo transactional email API (htmlContent + textContent). Retries 429/5xx with backoff. */
export function createBrevoMailer(opts: BrevoOptions): Mailer {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxAttempts = opts.maxAttempts ?? 3;
  return {
    name: "brevo",
    async send(msg: MailMessage) {
      const payload = {
        sender: { name: msg.from.name, email: msg.from.email },
        to: [{ email: msg.to.email, ...(msg.to.name ? { name: msg.to.name } : {}) }],
        subject: msg.subject,
        htmlContent: msg.html,
        textContent: msg.text,
        ...(msg.replyTo ? { replyTo: { email: msg.replyTo } } : {}),
        tags: [msg.kind],
      };
      let last: MailError | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let res: Response;
        try {
          res = await fetchImpl(ENDPOINT, {
            method: "POST",
            headers: { "api-key": opts.apiKey, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(30_000),
          });
        } catch (err) {
          last = new MailError(`Could not reach Brevo: ${err instanceof Error ? err.message : String(err)}`);
          if (attempt < maxAttempts) await sleep(1000 * 2 ** (attempt - 1));
          continue;
        }
        if (res.ok) {
          const json = (await res.json().catch(() => ({}))) as { messageId?: string };
          return { messageId: json.messageId ?? "", mock: false };
        }
        const body = await res.text().catch(() => "");
        let message = body.slice(0, 300);
        try {
          message = (JSON.parse(body) as { message?: string }).message ?? message;
        } catch {
          // keep raw text
        }
        const retryable = res.status === 429 || res.status >= 500;
        last = new MailError(`Brevo returned ${res.status}: ${message}`, res.status, !retryable);
        if (!retryable) break;
        if (attempt < maxAttempts) await sleep(1000 * 2 ** (attempt - 1));
      }
      throw last ?? new MailError("Unknown Brevo error.");
    },
  };
}
