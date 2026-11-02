import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listDocuments } from "@/lib/data/documents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/components/common/status";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  await requireUser();
  const docs = await listDocuments();
  return (
    <>
      <PageHeader
        title="Documents"
        description="Turn short notes into a full job description or an interview feedback report, then edit it."
        actions={
          <Button asChild>
            <Link href="/documents/new">
              <Plus /> New document
            </Link>
          </Button>
        }
      />
      {docs.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No documents yet"
          description="Write a few notes about a role or an interview and the AI drafts the document for you."
          action={
            <Button asChild>
              <Link href="/documents/new">
                <Plus /> Create a document
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
                <TH>Type</TH>
                <TH>Linked to</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">Updated</TH>
              </TR>
            </THead>
            <TBody>
              {docs.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <Link href={`/documents/${d.id}`} className="font-medium hover:underline">
                      {d.title || "Untitled"}
                    </Link>
                  </TD>
                  <TD>{d.type === "jd" ? "Job description" : "Feedback"}</TD>
                  <TD className="text-muted-foreground">{[d.job_title, d.candidate_name].filter(Boolean).join(" · ") || "-"}</TD>
                  <TD>
                    <Badge variant={d.status === "final" ? "success" : "secondary"}>{d.status === "final" ? "Final" : "Draft"}</Badge>
                  </TD>
                  <TD className="hidden text-muted-foreground md:table-cell">{formatDate(d.updated_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
