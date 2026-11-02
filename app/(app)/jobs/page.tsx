import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, Link2Off, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listJobs } from "@/lib/data/jobs";
import { isValidHttpsUrl } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate, JobStatusBadge } from "@/components/common/status";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage() {
  await requireUser();
  const jobs = await listJobs();
  return (
    <>
      <PageHeader
        title="Jobs"
        description="Each job has its description, facts and Flowmingo interview link."
        actions={
          <Button asChild>
            <Link href="/jobs/new">
              <Plus /> New job
            </Link>
          </Button>
        }
      />
      {jobs.length === 0 ? (
        <EmptyState
          icon={<Briefcase />}
          title="No jobs yet"
          description="Create your first job. Add the job description and the Flowmingo interview link, then add candidates."
          action={
            <Button asChild>
              <Link href="/jobs/new">
                <Plus /> Create a job
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Status</TH>
                <TH>Candidates</TH>
                <TH>Interview link</TH>
                <TH className="hidden md:table-cell">Updated</TH>
              </TR>
            </THead>
            <TBody>
              {jobs.map((j) => (
                <TR key={j.id}>
                  <TD>
                    <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                      {j.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[j.location, j.work_mode].filter(Boolean).join(" · ") || "No location set"}
                    </p>
                  </TD>
                  <TD>
                    <JobStatusBadge status={j.status} />
                  </TD>
                  <TD>
                    <Link href={`/candidates?job=${j.id}`} className="hover:underline">
                      {j.candidate_count}
                    </Link>
                  </TD>
                  <TD>
                    {isValidHttpsUrl(j.interview_link) ? (
                      <Badge variant="success">Added</Badge>
                    ) : (
                      <Badge variant="warning">
                        <Link2Off className="size-3" /> Missing
                      </Badge>
                    )}
                  </TD>
                  <TD className="hidden text-muted-foreground md:table-cell">{formatDate(j.updated_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
