import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDocument } from "@/lib/data/documents";
import { listJobOptions } from "@/lib/data/jobs";
import { PageHeader } from "@/components/ui/misc";
import { DocumentEditor } from "./editor";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) notFound();
  const jobs = await listJobOptions();
  return (
    <>
      <PageHeader
        title={doc.title || "Document"}
        description={`${doc.type === "jd" ? "Job description" : "Interview feedback"}${doc.job_title ? ` · ${doc.job_title}` : ""}${doc.candidate_name ? ` · ${doc.candidate_name}` : ""}`}
      />
      <DocumentEditor key={doc.updated_at} doc={doc} jobs={jobs} />
    </>
  );
}
