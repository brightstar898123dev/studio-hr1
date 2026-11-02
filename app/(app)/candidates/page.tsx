import type { Metadata } from "next";
import Link from "next/link";
import { Search, Upload, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listCandidates } from "@/lib/data/candidates";
import { listJobOptions } from "@/lib/data/jobs";
import { STAGE_LABELS, STAGES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, StageBadge } from "@/components/common/status";
import { AddCandidate } from "./add-candidate";
import { Kanban } from "./kanban";

export const metadata: Metadata = { title: "Candidates" };

type SP = Promise<{ q?: string; job?: string; stage?: string; view?: string }>;

export default async function CandidatesPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const [candidates, jobs] = await Promise.all([
    listCandidates({ q: sp.q, jobId: sp.job, stage: sp.stage }),
    listJobOptions(),
  ]);
  const filtered = !!(sp.q || sp.job || sp.stage);

  return (
    <>
      <PageHeader
        title="Candidates"
        description="Everyone you are recruiting, by stage."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/candidates/import">
                <Upload /> Import CSV
              </Link>
            </Button>
            <AddCandidate jobs={jobs} defaultJobId={sp.job} />
          </>
        }
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_200px_auto]" role="search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={sp.q} placeholder="Search name, email or phone" className="pl-8" aria-label="Search" />
        </div>
        <NativeSelect name="job" defaultValue={sp.job ?? ""} aria-label="Filter by job">
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="stage" defaultValue={sp.stage ?? ""} aria-label="Filter by stage">
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {filtered ? (
            <Button asChild variant="ghost">
              <Link href="/candidates">Clear</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {candidates.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={filtered ? "No candidates match" : "No candidates yet"}
          description={filtered ? "Try a different search or clear the filters." : "Add candidates one by one or import a CSV file from a spreadsheet."}
          action={
            filtered ? null : (
              <Button asChild variant="outline">
                <Link href="/candidates/import">
                  <Upload /> Import CSV
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <Tabs defaultValue={sp.view === "pipeline" ? "pipeline" : "table"}>
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          </TabsList>
          <TabsContent value="table">
            <Card>
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Job</TH>
                    <TH>Stage</TH>
                    <TH className="hidden md:table-cell">Last contacted</TH>
                    <TH className="hidden lg:table-cell">Source</TH>
                  </TR>
                </THead>
                <TBody>
                  {candidates.map((c) => (
                    <TR key={c.id}>
                      <TD>
                        <Link href={`/candidates/${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </TD>
                      <TD>{c.job_title ?? <span className="text-muted-foreground">No job</span>}</TD>
                      <TD>
                        <StageBadge stage={c.stage} />
                      </TD>
                      <TD className="hidden text-muted-foreground md:table-cell">{formatDate(c.last_contacted_at)}</TD>
                      <TD className="hidden text-muted-foreground lg:table-cell">{c.source ?? "-"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          </TabsContent>
          <TabsContent value="pipeline">
            <Kanban candidates={candidates} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
