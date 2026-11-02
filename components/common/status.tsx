import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS, type JobStatus, type OutboxStatus, type Stage } from "@/lib/types";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const variant = status === "open" ? "success" : status === "paused" ? "warning" : "secondary";
  return <Badge variant={variant}>{status[0]!.toUpperCase() + status.slice(1)}</Badge>;
}

export function StageBadge({ stage }: { stage: Stage }) {
  const variant =
    stage === "hired" || stage === "interested" || stage === "feedback_sent"
      ? "success"
      : stage === "rejected" || stage === "not_interested"
        ? "destructive"
        : stage === "needs_hr" || stage === "link_missing" || stage === "question_pending" || stage === "reschedule_requested"
          ? "warning"
          : stage === "paused"
            ? "secondary"
            : "default";
  return <Badge variant={variant}>{STAGE_LABELS[stage]}</Badge>;
}

export const OUTBOX_STATUS_LABELS: Record<OutboxStatus, string> = {
  draft: "Waiting for approval",
  needs_review: "Needs review",
  link_missing: "Link missing",
  approved: "Approved",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  rejected: "Rejected",
};

export function OutboxStatusBadge({ status }: { status: OutboxStatus }) {
  const variant =
    status === "sent" || status === "approved"
      ? "success"
      : status === "failed" || status === "rejected"
        ? "destructive"
        : status === "needs_review" || status === "link_missing"
          ? "warning"
          : "default";
  return <Badge variant={variant}>{OUTBOX_STATUS_LABELS[status]}</Badge>;
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <Badge variant="secondary">No score</Badge>;
  const variant = score >= 8 ? "success" : score >= 6 ? "warning" : "destructive";
  return <Badge variant={variant}>{score}/10</Badge>;
}

export function formatDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: process.env.APP_TIMEZONE ?? "Asia/Kolkata",
  });
}
