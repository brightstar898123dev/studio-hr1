"use client";
import { useState, useTransition } from "react";
import { Ban, CirclePause, Mail, Play, Trash2, UserCheck } from "lucide-react";
import { NativeSelect } from "@/components/ui/input";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { Candidate } from "@/lib/types";
import type { ActionResult } from "@/lib/validation";
import { deleteCandidateAction, doNotEmailAction, draftNowAction, moveCandidateAction, pauseCandidateAction } from "../actions";

export function CandidateActions({ candidate }: { candidate: Candidate }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(res.message ?? "Done.");
      else toast.error(res.error);
    });
  const paused = candidate.stage === "paused";
  const [draftType, setDraftType] = useState("outreach");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <NativeSelect aria-label="Email type to draft" value={draftType} onChange={(e) => setDraftType(e.target.value)}>
          <option value="outreach">First outreach</option>
          <option value="interview_invite">Interview invite</option>
          <option value="followup">Follow-up</option>
          <option value="feedback">Feedback</option>
        </NativeSelect>
        <Button variant="secondary" disabled={pending || candidate.do_not_email} onClick={() => run(() => draftNowAction(candidate.id, draftType))}>
          <Mail /> Draft
        </Button>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">Writes the email now. It waits in the Outbox for you.</p>
      <Button variant="outline" disabled={pending} onClick={() => run(() => pauseCandidateAction(candidate.id, !paused))}>
        {paused ? <Play /> : <CirclePause />} {paused ? "Resume" : "Pause"}
      </Button>
      <Button
        variant="outline"
        disabled={pending || candidate.stage === "interviewed"}
        onClick={() => run(() => moveCandidateAction(candidate.id, "interviewed"))}
      >
        <UserCheck /> Mark interviewed
      </Button>
      {candidate.do_not_email ? (
        <Button variant="outline" disabled={pending} onClick={() => run(() => doNotEmailAction(candidate.id, false))}>
          <Ban /> Allow emails again
        </Button>
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="outline" disabled={pending}>
              <Ban /> Add to do-not-email
            </Button>
          }
          title="Stop all emails to this person?"
          description="Emails waiting in the Outbox for them are cancelled, and no new ones will be drafted."
          confirmLabel="Stop emails"
          destructive
          onConfirm={() => run(() => doNotEmailAction(candidate.id, true))}
        />
      )}
      <ConfirmDialog
        trigger={
          <Button variant="ghost" className="text-destructive" disabled={pending}>
            <Trash2 /> Delete candidate
          </Button>
        }
        title="Delete this candidate?"
        description="Their details, conversation history and waiting emails are deleted. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteCandidateAction(candidate.id)}
      />
    </div>
  );
}
