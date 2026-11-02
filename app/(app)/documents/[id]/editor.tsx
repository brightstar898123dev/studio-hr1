"use client";
import { useState, useTransition } from "react";
import { Briefcase, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { MarkdownEditor } from "@/components/common/markdown-editor";
import type { DocumentListItem } from "@/lib/data/documents";
import { deleteDocumentAction, regenerateDocumentAction, saveDocumentAction, applyAsJobJdAction } from "../actions";

export function DocumentEditor({ doc, jobs }: { doc: DocumentListItem; jobs: { id: string; title: string }[] }) {
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [status, setStatus] = useState(doc.status);
  const [jobId, setJobId] = useState(doc.job_id ?? "");
  const [editorKey, setEditorKey] = useState(0);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <Field label="Title" htmlFor="doc-title">
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <MarkdownEditor key={editorKey} name="content" id="doc-content" value={content} onChange={setContent} rows={26} />
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Status" htmlFor="doc-status">
              <NativeSelect id="doc-status" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "final")}>
                <option value="draft">Draft</option>
                <option value="final">Final</option>
              </NativeSelect>
            </Field>
            <Button
              className="w-full"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveDocumentAction(doc.id, { title, content, status });
                  if (r.ok) toast.success(r.message ?? "Saved.");
                  else toast.error(r.error);
                })
              }
            >
              <Save /> Save
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="outline" className="w-full" disabled={pending}>
                  <RefreshCw /> Redraft from notes
                </Button>
              }
              title="Write a new draft from your notes?"
              description="The text in the editor is replaced. Nothing is saved until you click Save."
              confirmLabel="Redraft"
              onConfirm={() =>
                start(async () => {
                  const r = await regenerateDocumentAction(doc.id);
                  if (r.ok && r.data) {
                    setContent(r.data.content);
                    setEditorKey((k) => k + 1);
                    toast.success(r.message ?? "Redrafted.");
                  } else if (!r.ok) toast.error(r.error);
                })
              }
            />
            <ConfirmDialog
              trigger={
                <Button variant="ghost" className="w-full text-destructive" disabled={pending}>
                  <Trash2 /> Delete
                </Button>
              }
              title="Delete this document?"
              description="This cannot be undone."
              confirmLabel="Delete"
              destructive
              onConfirm={() => deleteDocumentAction(doc.id)}
            />
          </CardContent>
        </Card>
        {doc.type === "jd" ? (
          <Card>
            <CardHeader>
              <CardTitle>Use as a job&apos;s JD</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <NativeSelect aria-label="Job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">Choose a job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </NativeSelect>
              <ConfirmDialog
                trigger={
                  <Button variant="secondary" className="w-full" disabled={pending || !jobId}>
                    <Briefcase /> Use as this job&apos;s JD
                  </Button>
                }
                title="Replace the job description?"
                description="The job's current description is replaced with this document. Future emails use the new text."
                confirmLabel="Replace"
                onConfirm={() =>
                  start(async () => {
                    const r = await applyAsJobJdAction(doc.id, jobId, content);
                    if (r.ok) toast.success(r.message ?? "Done.");
                    else toast.error(r.error);
                  })
                }
              />
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Your notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{doc.notes}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
