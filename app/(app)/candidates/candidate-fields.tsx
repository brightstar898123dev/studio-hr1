"use client";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { DECISION_LABELS, DECISIONS, STAGE_LABELS, STAGES, type Candidate, type Job } from "@/lib/types";

export type JobOption = Pick<Job, "id" | "title" | "status">;

/** Shared inputs for the add dialog and the detail page. */
export function CandidateFields({
  candidate,
  jobs,
  errors,
  full = false,
  defaultJobId,
}: {
  candidate?: Candidate;
  jobs: JobOption[];
  errors: Record<string, string>;
  full?: boolean;
  defaultJobId?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" htmlFor="name" error={errors.name}>
        <Input id="name" name="name" defaultValue={candidate?.name} required />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email}>
        <Input id="email" name="email" type="email" defaultValue={candidate?.email} required />
      </Field>
      <Field label="Phone (optional)" htmlFor="phone">
        <Input id="phone" name="phone" defaultValue={candidate?.phone ?? ""} />
      </Field>
      <Field label="Job" htmlFor="job_id">
        <NativeSelect id="job_id" name="job_id" defaultValue={candidate?.job_id ?? defaultJobId ?? ""}>
          <option value="">No job</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
              {j.status !== "open" ? ` (${j.status})` : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Stage" htmlFor="stage">
        <NativeSelect id="stage" name="stage" defaultValue={candidate?.stage ?? "new"}>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Source (optional)" htmlFor="source" help="Where you found them, e.g. LinkedIn.">
        <Input id="source" name="source" defaultValue={candidate?.source ?? ""} />
      </Field>
      <Field label="Profile notes (optional)" htmlFor="profile_notes" help="Facts the AI may use, e.g. current role, years of experience." className="sm:col-span-2">
        <Textarea id="profile_notes" name="profile_notes" rows={3} defaultValue={candidate?.profile_notes ?? ""} />
      </Field>
      {full ? (
        <>
          <Field label="Interview link for this candidate (optional)" htmlFor="interview_link_override" error={errors.interview_link_override} help="Overrides the job's Flowmingo link for this person only." className="sm:col-span-2">
            <Input id="interview_link_override" name="interview_link_override" type="url" defaultValue={candidate?.interview_link_override ?? ""} placeholder="https://..." />
          </Field>
          <Field label="HR notes" htmlFor="hr_notes" help="Your interview notes. When the candidate is Interviewed and this is filled, a feedback email is drafted." className="sm:col-span-2">
            <Textarea id="hr_notes" name="hr_notes" rows={5} defaultValue={candidate?.hr_notes ?? ""} />
          </Field>
          <Field label="Decision" htmlFor="decision" help="The feedback email states a decision only if you set one here.">
            <NativeSelect id="decision" name="decision" defaultValue={candidate?.decision ?? ""}>
              <option value="">No decision yet</option>
              {DECISIONS.map((d) => (
                <option key={d} value={d}>
                  {DECISION_LABELS[d]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </>
      ) : null}
    </div>
  );
}
