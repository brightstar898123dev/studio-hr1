"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, NativeSelect, Textarea } from "@/components/ui/input";
import { useActionToast } from "@/components/forms/use-action-toast";
import { createDocumentAction } from "../actions";

export function NewDocumentForm({
  jobs,
  candidates,
  defaults,
}: {
  jobs: { id: string; title: string }[];
  candidates: { id: string; name: string; job_id: string | null }[];
  defaults: { type?: string; job?: string; candidate?: string };
}) {
  const { formAction, pending, errors } = useActionToast(createDocumentAction);
  const [type, setType] = useState(defaults.type === "feedback" ? "feedback" : "jd");
  const [jobId, setJobId] = useState(defaults.job ?? "");
  const list = jobId ? candidates.filter((c) => c.job_id === jobId) : candidates;
  return (
    <Card>
      <CardContent className="pt-5">
        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Document type" htmlFor="type">
            <NativeSelect id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="jd">Job description</option>
              <option value="feedback">Interview feedback</option>
            </NativeSelect>
          </Field>
          <Field label={type === "jd" ? "Job (optional)" : "Job"} htmlFor="job_id" help={type === "feedback" ? "Its feedback criteria are used." : "Link it now or later."}>
            <NativeSelect id="job_id" name="job_id" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">No job</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {type === "feedback" ? (
            <Field label="Candidate" htmlFor="candidate_id" error={errors.candidate_id} className="sm:col-span-2">
              <NativeSelect id="candidate_id" name="candidate_id" defaultValue={defaults.candidate ?? ""}>
                <option value="">Choose a candidate</option>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          <Field
            label="Your notes"
            htmlFor="notes"
            error={errors.notes}
            className="sm:col-span-2"
            help={type === "jd" ? "E.g. role, team, main tasks, must-have skills, location, work mode, salary if you want it shown." : "E.g. what went well, concerns, examples from the interview."}
          >
            <Textarea id="notes" name="notes" rows={10} required />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={pending}>
              <Sparkles /> {pending ? "Writing... (can take up to a minute)" : "Draft with AI"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
