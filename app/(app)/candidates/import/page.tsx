import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listJobOptions } from "@/lib/data/jobs";
import { PageHeader } from "@/components/ui/misc";
import { Importer } from "./importer";

export const metadata: Metadata = { title: "Import candidates" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  await requireUser();
  const [{ job }, jobs] = await Promise.all([searchParams, listJobOptions()]);
  return (
    <>
      <PageHeader title="Import candidates" description="Add many candidates at once from a spreadsheet (CSV file)." />
      <Importer jobs={jobs} defaultJobId={job} />
    </>
  );
}
