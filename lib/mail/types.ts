export type MailMessage = {
  to: { email: string; name?: string };
  from: { email: string; name: string };
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  /** "candidate" | "digest" | "test" - stored in mail_log. */
  kind: string;
};

export type MailResult = { messageId: string; mock: boolean };

export interface Mailer {
  readonly name: string;
  send(msg: MailMessage): Promise<MailResult>;
}

export class MailError extends Error {
  constructor(message: string, readonly status?: number, readonly permanent = false) {
    super(message);
    this.name = "MailError";
  }
}
