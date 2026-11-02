"use client";
import { useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { MarkdownEditor } from "@/components/common/markdown-editor";
import { useActionToast } from "@/components/forms/use-action-toast";
import type { Job } from "@/lib/types";
import { isValidHttpsUrl, type ActionResult } from "@/lib/validation";

export type PromptDefaults = Partial<Record<"outreach" | "interview_invite" | "followup" | "feedback", string>>;

const PROMPT_FIELDS = [
  { name: "prompt_outreach", type: "outreach", label: "First outreach email" },
  { name: "prompt_interview_invite", type: "interview_invite", label: "Interview invite" },
  { name: "prompt_followup", type: "followup", label: "Follow-up" },
  { name: "prompt_feedback", type: "feedback", label: "Feedback email" },
] as const;

function preview(text: string | undefined): string {
  if (!text) return "Leave empty to use the global prompt.";
  const t = text.replace(/\s+/g, " ").trim();
  return `Leave empty to use the global prompt: "${t.slice(0, 220)}${t.length > 220 ? "..." : ""}"`;
}

export function JobForm({
  job,
  action,
  onDelete,
  promptDefaults = {},
}: {
  job?: Job;
  action: (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
  onDelete?: () => Promise<void>;
  promptDefaults?: PromptDefaults;
}) {
  const { formAction, pending, errors } = useActionToast(action);
  const [link, setLink] = useState(job?.interview_link ?? "");
  const linkOk = isValidHttpsUrl(link);

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Job title" htmlFor="title" error={errors.title} help="Used exactly as written in every email.">
            <Input id="title" name="title" defaultValue={job?.title} required placeholder="Senior Accountant" />
          </Field>
          <Field label="Status" htmlFor="status" help="Paused and closed jobs are skipped by automation.">
            <NativeSelect id="status" name="status" defaultValue={job?.status ?? "open"}>
              <option value="open">Open</option>
              <option value="paused">Paused</option>
              <option value="closed">Closed</option>
            </NativeSelect>
          </Field>
          <Field label="Tone for this job (optional)" htmlFor="tone" help="Overrides the tone in Settings.">
            <Input id="tone" name="tone" defaultValue={job?.tone ?? ""} placeholder="e.g. friendly and energetic" />
          </Field>
          <Field label="Must mention (optional)" htmlFor="must_mention" help="Facts every email should include.">
            <Input id="must_mention" name="must_mention" defaultValue={job?.must_mention ?? ""} placeholder="e.g. Immediate joiners preferred" />
          </Field>
          <Field label="Screening questions (optional)" htmlFor="screening_questions" className="sm:col-span-2">
            <Textarea id="screening_questions" name="screening_questions" rows={3} defaultValue={job?.screening_questions ?? ""} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job description</CardTitle>
          <CardDescription>The AI only uses facts written here and in the fields below.</CardDescription>
        </CardHeader>
        <CardContent>
          <MarkdownEditor name="jd" id="jd" defaultValue={job?.jd ?? ""} placeholder={"# About the role\n\n## What you will do\n- ..."} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Facts</CardTitle>
          <CardDescription>Salary is only mentioned in emails if you fill it in.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Location" htmlFor="location">
            <Input id="location" name="location" defaultValue={job?.location ?? ""} placeholder="Bengaluru" />
          </Field>
          <Field label="Work mode" htmlFor="work_mode">
            <NativeSelect id="work_mode" name="work_mode" defaultValue={job?.work_mode ?? ""}>
              <option value="">Not specified</option>
              <option value="onsite">On-site</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
            </NativeSelect>
          </Field>
          <Field label="Salary range (optional)" htmlFor="salary_range">
            <Input id="salary_range" name="salary_range" defaultValue={job?.salary_range ?? ""} placeholder="e.g. 8-10 LPA" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interview link</CardTitle>
          <CardDescription>The Flowmingo interview link for this job. It is put into the invite email exactly as written.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field label="Flowmingo link" htmlFor="interview_link" error={errors.interview_link}>
            <div className="flex gap-2">
              <Input
                id="interview_link"
                name="interview_link"
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://..."
              />
              <Button type="button" variant="outline" disabled={!linkOk} onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
                <ExternalLink /> Test link
              </Button>
            </div>
          </Field>
          {!link ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No link yet: interview invites for this job will wait in the Outbox under &quot;Link missing&quot;.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom prompts (optional)</CardTitle>
          <CardDescription>Extra instructions for the AI for this job only. Leave empty to use the global prompts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {PROMPT_FIELDS.map((p) => (
            <Field key={p.name} label={p.label} htmlFor={p.name}>
              <Textarea id={p.name} name={p.name} rows={3} defaultValue={job?.[p.name] ?? ""} placeholder={preview(promptDefaults[p.type])} />
            </Field>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Replies and feedback</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Reply notes" htmlFor="reply_notes" help="Answers to common questions (notice period, shift timing, process). Used when replying to candidates.">
            <Textarea id="reply_notes" name="reply_notes" rows={4} defaultValue={job?.reply_notes ?? ""} />
          </Field>
          <Field label="Feedback criteria" htmlFor="feedback_criteria" help="What you assess candidates on. Used for feedback emails and documents.">
            <Textarea id="feedback_criteria" name="feedback_criteria" rows={4} defaultValue={job?.feedback_criteria ?? ""} />
          </Field>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        {onDelete ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" className="text-destructive">
                <Trash2 /> Delete job
              </Button>
            }
            title="Delete this job?"
            description="The job and its job-specific email formats are deleted. Candidates stay but are no longer linked to a job. This cannot be undone."
            confirmLabel="Delete job"
            destructive
            onConfirm={onDelete}
          />
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : job ? "Save job" : "Create job"}
        </Button>
      </div>
    </form>
  );
}
