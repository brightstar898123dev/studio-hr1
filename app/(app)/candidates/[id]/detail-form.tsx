"use client";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/forms/use-action-toast";
import type { Candidate } from "@/lib/types";
import type { ActionResult } from "@/lib/validation";
import { CandidateFields, type JobOption } from "../candidate-fields";

export function CandidateDetailForm({
  candidate,
  jobs,
  action,
}: {
  candidate: Candidate;
  jobs: JobOption[];
  action: (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
}) {
  const { formAction, pending, errors } = useActionToast(action);
  return (
    <form action={formAction} className="space-y-4">
      <CandidateFields candidate={candidate} jobs={jobs} errors={errors} full />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
