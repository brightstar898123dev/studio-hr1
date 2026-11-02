import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { getPromptDefaultsForJobs } from "@/lib/prompts/for-jobs";
import { JobForm } from "../job-form";
import { createJobAction } from "../actions";

export const metadata: Metadata = { title: "New job" };

export default async function NewJobPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="New job" description="Fill in what you know. You can change everything later." />
      <JobForm action={createJobAction} promptDefaults={await getPromptDefaultsForJobs()} />
    </>
  );
}
