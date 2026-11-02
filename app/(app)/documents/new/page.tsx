import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { listJobOptions } from "@/lib/data/jobs";
import { PageHeader } from "@/components/ui/misc";
import { NewDocumentForm } from "./new-form";

export const metadata: Metadata = { title: "New document" };

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ type?: string; job?: string; candidate?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const [jobs, candidates] = await Promise.all([
    listJobOptions(),
    db.query<{ id: string; name: string; job_id: string | null }>("select id, name, job_id from candidates order by name"),
  ]);
  return (
    <>
      <PageHeader title="New document" description="The AI only uses your notes and the linked job and candidate. Anything missing is marked 'To confirm'." />
      <NewDocumentForm jobs={jobs} candidates={candidates} defaults={sp} />
    </>
  );
}
