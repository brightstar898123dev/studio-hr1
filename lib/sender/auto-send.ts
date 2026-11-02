import type { OutboxStatus, ReplyCategory } from "@/lib/types";

/**
 * Auto-send rule. Only drafts that passed BOTH the rule checks and the AI check
 * are auto-approved, and only when auto_send is on. "needs_review", "link_missing"
 * and replies to an "other" (unclear) message NEVER auto-send.
 */
export function shouldAutoApprove(input: {
  autoSend: boolean;
  status: OutboxStatus;
  passedBoth: boolean;
  replyCategory?: ReplyCategory | null;
}): boolean {
  if (!input.autoSend) return false;
  if (input.status !== "draft") return false;
  if (!input.passedBoth) return false;
  if (input.replyCategory === "other") return false;
  return true;
}
