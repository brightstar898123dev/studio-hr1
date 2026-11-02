"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Link2Off, RefreshCw, RotateCcw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmailPreview } from "@/components/common/email-preview";
import { formatDate, OutboxStatusBadge, ScoreBadge } from "@/components/common/status";
import { EMAIL_TYPE_LABELS } from "@/lib/types";
import type { ActionResult } from "@/lib/validation";
import { approveAction, editAction, getOutboxDetailAction, recheckAction, rejectAction, retryAction, sendNowAction, type OutboxDetail } from "./actions";

export function OutboxDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<OutboxDetail | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tab, setTab] = useState("preview");
  const [pending, start] = useTransition();

  const load = (rowId: string) =>
    getOutboxDetailAction(rowId).then((d) => {
      setDetail(d);
      setSubject(d?.subject ?? "");
      setBody(d?.body ?? "");
    });

  useEffect(() => {
    if (!id) return;
    let alive = true;
    void getOutboxDetailAction(id).then((d) => {
      if (!alive) return;
      setDetail(d);
      setSubject(d?.subject ?? "");
      setBody(d?.body ?? "");
      setTab(d?.status === "needs_review" ? "checks" : "preview");
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const run = (fn: () => Promise<ActionResult>, close = false) =>
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(res.message ?? "Done.");
      else toast.error(res.error);
      if (close && res.ok) onClose();
      else if (id) await load(id);
    });

  const d = detail && detail.id === id ? detail : null;
  const editable = d && ["draft", "needs_review", "approved", "failed"].includes(d.status);
  const dirty = d && (subject !== d.subject || body !== d.body);

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent title={d ? d.subject || EMAIL_TYPE_LABELS[d.type] : "Loading..."} description={d ? `${EMAIL_TYPE_LABELS[d.type]} to ${d.candidate_name} <${d.to_email}>` : undefined}>
        {!d ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <OutboxStatusBadge status={d.status} />
              <ScoreBadge score={d.checker_score} />
              {d.rewrite_count ? <span className="text-xs text-muted-foreground">Rewritten once by the checker</span> : null}
              {d.edited_by_hr ? <span className="text-xs text-muted-foreground">Edited by you</span> : null}
              <span className="text-xs text-muted-foreground">Job: {d.job_title ?? "none"}</span>
              <Link href={`/candidates/${d.candidate_id}`} className="text-xs text-primary underline">
                Open candidate
              </Link>
            </div>
            {d.error ? <Alert variant="error">{d.error}</Alert> : null}
            {d.status === "link_missing" ? (
              <Alert variant="warning" title="Interview link missing">
                Add a https:// Flowmingo link to the{" "}
                <Link href={d.job_id ? `/jobs/${d.job_id}` : "/jobs"} className="underline">
                  job
                </Link>{" "}
                or the{" "}
                <Link href={`/candidates/${d.candidate_id}`} className="underline">
                  candidate
                </Link>
                , then click Re-check to write the invite.
              </Alert>
            ) : null}
            {d.reply_text ? (
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">The candidate wrote</summary>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{d.reply_text}</p>
              </details>
            ) : null}

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="text">Plain text</TabsTrigger>
                {editable ? <TabsTrigger value="edit">Edit</TabsTrigger> : null}
                <TabsTrigger value="checks">Checks ({d.checker_issues.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="preview">
                {d.preview_html ? <EmailPreview html={d.preview_html} /> : <p className="text-sm text-muted-foreground">No email yet.</p>}
              </TabsContent>
              <TabsContent value="text">
                <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 text-sm">{d.text || "No email yet."}</pre>
              </TabsContent>
              {editable ? (
                <TabsContent value="edit" className="space-y-3">
                  <Field label="Subject" htmlFor="edit-subject">
                    <Input id="edit-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                  </Field>
                  <Field label="Email text" htmlFor="edit-body" help="Write the text only. The format adds the greeting design, interview button and your signature. Do not add links.">
                    <Textarea id="edit-body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
                  </Field>
                  <Button disabled={pending || !dirty} onClick={() => run(() => editAction(d.id, subject, body))}>
                    Save changes
                  </Button>
                </TabsContent>
              ) : null}
              <TabsContent value="checks">
                {d.checker_issues.length === 0 ? (
                  <Alert variant="success">No issues found.</Alert>
                ) : (
                  <ul className="space-y-2">
                    {d.checker_issues.map((i, n) => (
                      <li key={n} className="rounded-lg border p-3 text-sm">
                        <span className="mr-2 text-xs font-medium uppercase text-muted-foreground">
                          {i.source === "ai" ? "AI check" : i.source === "rules" ? "Rule" : "System"}
                        </span>
                        {i.message}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>

            <div className="mt-auto flex flex-wrap gap-2 border-t pt-4">
              {d.status === "draft" ? (
                <Button disabled={pending} onClick={() => run(() => approveAction([d.id]), true)}>
                  <Check /> Approve
                </Button>
              ) : null}
              {d.status === "needs_review" && d.body.trim() ? (
                <ConfirmDialog
                  trigger={
                    <Button disabled={pending}>
                      <Check /> Approve anyway
                    </Button>
                  }
                  title="Approve an email that needs review?"
                  description="The checker found issues with this email. Only approve if you have read it and it is correct."
                  confirmLabel="Approve"
                  onConfirm={() => run(() => approveAction([d.id]), true)}
                />
              ) : null}
              {d.status === "approved" ? (
                <Button variant="success" disabled={pending} onClick={() => run(() => sendNowAction(d.id))}>
                  <Send /> Send now
                </Button>
              ) : null}
              {d.status === "failed" ? (
                <Button disabled={pending} onClick={() => run(() => retryAction(d.id))}>
                  <RotateCcw /> Retry
                </Button>
              ) : null}
              {["draft", "needs_review", "approved", "failed", "link_missing"].includes(d.status) ? (
                <Button variant="outline" disabled={pending} onClick={() => run(() => recheckAction(d.id))}>
                  {d.status === "link_missing" ? <Link2Off /> : <RefreshCw />} Re-check
                </Button>
              ) : null}
              {["draft", "needs_review", "approved", "failed", "link_missing"].includes(d.status) ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" className="text-destructive" disabled={pending}>
                      <X /> Reject
                    </Button>
                  }
                  title="Reject this email?"
                  description="It will not be sent. The automation will not draft the same email again unless the candidate's stage changes."
                  confirmLabel="Reject"
                  destructive
                  onConfirm={() => run(() => rejectAction(d.id), true)}
                />
              ) : null}
              <span className="ml-auto self-center text-xs text-muted-foreground">
                {d.sent_at ? `Sent ${formatDate(d.sent_at)}` : `Created ${formatDate(d.created_at)}`}
              </span>
            </div>
          </>
        )}
      </SheetContent>
    </Dialog>
  );
}
