import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Clock, MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCandidate } from "@/lib/data/candidates";
import { listJobOptions } from "@/lib/data/jobs";
import { getSettings } from "@/lib/data/settings";
import { getTimeline } from "@/lib/data/timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatDate, OutboxStatusBadge, StageBadge } from "@/components/common/status";
import { EMAIL_TYPE_LABELS, type TemplateType } from "@/lib/types";
import { CandidateDetailForm } from "./detail-form";
import { CandidateActions } from "./candidate-actions";
import { updateCandidateAction } from "../actions";

export const metadata: Metadata = { title: "Candidate" };

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const candidate = await getCandidate(id);
  if (!candidate) notFound();
  const [jobs, timeline, settings] = await Promise.all([listJobOptions(), getTimeline(id), getSettings()]);
  const replyAddress = settings.reply_domain ? `${candidate.reply_token}@${settings.reply_domain}` : null;

  return (
    <>
      <PageHeader
        title={candidate.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {candidate.email} <StageBadge stage={candidate.stage} />
            {candidate.do_not_email ? <Badge variant="destructive">Do not email</Badge> : null}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <CandidateDetailForm key={candidate.updated_at} candidate={candidate} jobs={jobs} action={updateCandidateAction.bind(null, candidate.id)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <EmptyState icon={<MessageSquare />} title="No emails yet" description="Emails sent, replies received and drafts waiting will show here." />
              ) : (
                <ol className="space-y-4">
                  {timeline.map((t) => (
                    <li key={`${t.kind}-${t.id}`} className="flex gap-3">
                      <div className="mt-1 shrink-0 rounded-full bg-muted p-1.5" aria-hidden>
                        {t.kind === "in" ? <ArrowDownLeft className="size-3.5" /> : t.kind === "out" ? <ArrowUpRight className="size-3.5" /> : <Clock className="size-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1 rounded-lg border p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {t.kind === "in" ? "Candidate replied" : t.kind === "out" ? "Email sent" : `Draft: ${EMAIL_TYPE_LABELS[t.type as TemplateType] ?? t.type}`}
                          </span>
                          {t.category ? <Badge variant="secondary">{t.category.replace(/_/g, " ")}</Badge> : null}
                          {t.status ? <OutboxStatusBadge status={t.status} /> : null}
                          <span>{formatDate(t.at)}</span>
                        </div>
                        {t.subject ? <p className="mt-1 text-sm font-medium">{t.subject}</p> : null}
                        {t.text ? <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-sm text-muted-foreground">{t.text}</p> : null}
                        {t.kind === "draft" ? (
                          <Link href={`/outbox?open=${t.id}`} className="mt-1 inline-block text-xs font-medium text-primary underline">
                            Open in Outbox
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <CandidateActions candidate={candidate} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Last contacted:</span> {formatDate(candidate.last_contacted_at)}
              </p>
              <p>
                <span className="text-muted-foreground">Last reply:</span> {formatDate(candidate.last_reply_at)}
              </p>
              <p>
                <span className="text-muted-foreground">Follow-ups sent:</span> {candidate.followup_count}
              </p>
              <p>
                <span className="text-muted-foreground">Added:</span> {formatDate(candidate.created_at)}
              </p>
              {replyAddress ? (
                <p className="break-all">
                  <span className="text-muted-foreground">Replies go to:</span> <code className="text-xs">{replyAddress}</code>
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
