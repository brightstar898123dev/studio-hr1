"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useActionToast } from "@/components/forms/use-action-toast";
import { CandidateFields, type JobOption } from "./candidate-fields";
import { createCandidateAction } from "./actions";

export function AddCandidate({ jobs, defaultJobId }: { jobs: JobOption[]; defaultJobId?: string }) {
  const [open, setOpen] = useState(false);
  const { state, formAction, pending, errors } = useActionToast(createCandidateAction);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the dialog after a successful save
    if (state?.ok) setOpen(false);
  }, [state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add candidate
        </Button>
      </DialogTrigger>
      <DialogContent title="Add a candidate" description="They start in the New stage. The outreach job will draft their first email." className="max-w-2xl">
        <form action={formAction} className="space-y-4">
          <CandidateFields jobs={jobs} errors={errors} defaultJobId={defaultJobId} />
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add candidate"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
