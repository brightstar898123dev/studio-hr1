import type { ActivityRow } from "@/lib/types";

/** Plain-English sentence for an activity log row. */
export function describeActivity(a: Pick<ActivityRow, "action" | "details">): string {
  const d = (a.details ?? {}) as Record<string, unknown>;
  const s = (k: string) => (d[k] === undefined || d[k] === null ? "" : String(d[k]));
  const type = s("type").replace(/_/g, " ");
  const a_ = /^[aeiou]/i.test(type) ? "an" : "a";
  switch (a.action) {
    case "draft.created": return `Drafted ${a_} ${type} email (score ${s("score") || "-"})`;
    case "draft.auto_approved": return `Drafted and auto-approved ${a_} ${type} email (score ${s("score")})`;
    case "draft.needs_review": return `Drafted ${a_} ${type} email that needs review`;
    case "draft.link_missing": return "Interview invite waiting: no interview link";
    case "email.sent": return `Sent ${a_} ${type} email to ${s("to")}`;
    case "email.sent_mock": return `Test mode: recorded ${a_} ${type} email to ${s("to")} (not really sent)`;
    case "email.failed": return `Sending failed: ${s("error")}`;
    case "email.test_sent": return `Test email to ${s("to")}${d.mock ? " (test mode)" : ""}`;
    case "email.test_failed": return `Test email failed: ${s("error")}`;
    case "email.sent_bookkeeping_failed": return `Email sent, but saving the history failed: ${s("error")}`;
    case "send.run": return `Send run: ${s("sent")} sent, ${s("failed")} failed${d.limitReached ? " (daily limit reached)" : ""}`;
    case "send.skipped_suppressed": return `Not sent: address is ${s("reason")}`;
    case "send.blocked_edit_failed_checks": return "Not sent: your edits did not pass the checks";
    case "inbound.received": return `Reply received: "${s("subject")}"`;
    case "inbound.classified": return `Reply classified as ${s("category").replace(/_/g, " ")}: ${s("summary")}`;
    case "inbound.unknown_sender": return `Email from unknown sender ${s("from")}: "${s("subject")}"`;
    case "inbound.auto_reply": return `Automatic reply (out of office) received`;
    case "inbound.bounce": return `Bounce received: "${s("subject")}"`;
    case "inbound.unsubscribe": return "Candidate asked to stop emails (unsubscribed)";
    case "inbound.invalid_payload": return `Webhook received an invalid payload: ${s("error")}`;
    case "inbound.error":
    case "inbound.process_error": return `Problem handling a reply: ${s("error")}`;
    case "outbox.approved": return "Email approved";
    case "outbox.rejected": return "Email rejected";
    case "outbox.edited": return `Email edited${d.passed === false ? " (checks failed)" : ""}`;
    case "outbox.rechecked": return `Email re-checked${d.score !== undefined && d.score !== null ? ` (score ${s("score")})` : ""}`;
    case "outbox.retry": return "Failed email queued again";
    case "candidate.created": return `Candidate added: ${s("name")}`;
    case "candidate.updated": return d.from ? `Candidate updated (stage ${s("from")} -> ${s("to")})` : "Candidate updated";
    case "candidate.stage_changed": return `Stage changed: ${s("from").replace(/_/g, " ")} -> ${s("to").replace(/_/g, " ")}`;
    case "candidate.paused": return "Candidate paused";
    case "candidate.resumed": return "Candidate resumed";
    case "candidate.imported": return `CSV import: ${s("created")} added, ${s("duplicates")} duplicates, ${s("invalid")} invalid`;
    case "candidate.deleted": return "Candidate deleted";
    case "candidate.do_not_email_on": return "Added to do-not-email";
    case "candidate.do_not_email_off": return "Removed from do-not-email";
    case "job.created": return `Job created: ${s("title")}`;
    case "job.updated": return `Job updated: ${s("title")}`;
    case "job.deleted": return "Job deleted";
    case "template.saved": return `Email format saved (${type})`;
    case "template.reset": return `Email format reset to default (${type})`;
    case "prompt.saved": return "Prompt saved";
    case "prompt.reset": return "Prompt reset to default";
    case "settings.updated": return `Settings saved${d.auto_send ? " (automatic sending ON)" : ""}`;
    case "brevo.webhook_registered": return d.ok ? `Brevo reply webhook connected for ${s("domain")}` : `Brevo reply webhook failed: ${s("error")}`;
    case "ai.tested": return d.ok ? `AI test passed (${s("model")})` : `AI test failed: ${s("error")}`;
    case "automation.outreach": return `Outreach run: ${s("drafted")} drafted${d.stoppedBecause ? ` (stopped: ${s("stoppedBecause").replace("_", " ")})` : ""}`;
    case "automation.stage_emails": return `Stage emails run: ${s("drafted")} drafted, ${s("sent")} sent`;
    case "digest.sent": return `Daily digest sent to ${s("to")}`;
    case "digest.skipped": return `Daily digest skipped: ${s("reason")}`;
    case "document.created": return "Document drafted";
    case "document.saved": return "Document saved";
    case "document.regenerated": return "Document redrafted";
    case "document.used_as_jd": return "Document used as a job description";
    case "document.deleted": return "Document deleted";
    default:
      if (a.action.startsWith("cron.") && a.action.endsWith(".error")) return `Scheduled job failed: ${s("error")}`;
      return a.action.replace(/[._]/g, " ");
  }
}

export const ACTIVITY_GROUPS = {
  emails: { label: "Emails sent", prefixes: ["email.", "send."] },
  drafts: { label: "Drafts and Outbox", prefixes: ["draft.", "outbox."] },
  replies: { label: "Replies", prefixes: ["inbound."] },
  candidates: { label: "Candidates", prefixes: ["candidate."] },
  setup: { label: "Jobs, formats, prompts, settings", prefixes: ["job.", "template.", "prompt.", "settings.", "ai.", "document."] },
  automation: { label: "Scheduled jobs", prefixes: ["automation.", "digest.", "cron."] },
} as const;

export function isProblem(action: string): boolean {
  return /failed|error|invalid|bounce|blocked/.test(action);
}
