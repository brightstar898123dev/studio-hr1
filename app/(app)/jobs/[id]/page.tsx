import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getJob } from "@/lib/data/jobs";
import { getPromptDefaultsForJobs } from "@/lib/prompts/for-jobs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { JobStatusBadge } from "@/components/common/status";
import { JobForm } from "../job-form";
import { deleteJobAction, updateJobAction } from "../actions";

export const metadata: Metadata = { title: "Edit job" };

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  return (
    <>
      <PageHeader
        title={job.title}
        description={<JobStatusBadge status={job.status} />}
        actions={
          <Button asChild variant="outline">
            <Link href={`/candidates?job=${job.id}`}>
              <Users /> Candidates
            </Link>
          </Button>
        }
      />
      <JobForm
        key={job.updated_at}
        job={job}
        action={updateJobAction.bind(null, job.id)}
        onDelete={deleteJobAction.bind(null, job.id)}
        promptDefaults={await getPromptDefaultsForJobs()}
      />
    </>
  );
}
