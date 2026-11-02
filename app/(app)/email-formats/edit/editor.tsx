"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailPreview } from "@/components/common/email-preview";
import { builtInTemplate, DEFAULT_TEXT_TEMPLATE } from "@/lib/email/defaults";
import { PLACEHOLDERS, SAMPLE_DATA, SUBJECT_ONLY_PLACEHOLDERS, type TemplateData } from "@/lib/email/placeholders";
import { renderEmail } from "@/lib/email/render";
import { validateTemplate } from "@/lib/email/validate";
import { EMAIL_TYPE_LABELS, TEMPLATE_TYPES, type Template, type TemplateType } from "@/lib/types";
import { resetTemplateAction, saveTemplateAction } from "../actions";

export function TemplateEditor({
  template,
  initialType,
  initialJobId,
  jobs,
  branding,
}: {
  template: Template | null;
  initialType: TemplateType;
  initialJobId: string | null;
  jobs: { id: string; title: string }[];
  branding: Partial<TemplateData>;
}) {
  const router = useRouter();
  const start = template ?? { type: initialType, job_id: initialJobId, name: "", ...builtInTemplate(initialType) };
  const [type, setType] = useState<TemplateType>(start.type);
  const [jobId, setJobId] = useState(start.job_id ?? "");
  const [name, setName] = useState(start.name);
  const [format, setFormat] = useState<"html" | "text">(start.format);
  const [subject, setSubject] = useState(start.subject_template);
  const [body, setBody] = useState(start.body_template);
  const [pending, startTransition] = useTransition();

  const errors = useMemo(() => validateTemplate({ type, format, subject_template: subject, body_template: body }), [type, format, subject, body]);
  const sample: TemplateData = useMemo(() => {
    const job = jobs.find((j) => j.id === jobId);
    return { ...SAMPLE_DATA, ...branding, job_title: job?.title ?? SAMPLE_DATA.job_title };
  }, [branding, jobId, jobs]);
  const preview = useMemo(() => {
    try {
      return renderEmail({ format, subject_template: subject, body_template: body }, type === "digest" ? { ...sample, interview_link: "" } : sample);
    } catch {
      return null;
    }
  }, [format, subject, body, sample, type]);

  function loadDefault(nextFormat = format) {
    if (nextFormat === "text") {
      setBody(DEFAULT_TEXT_TEMPLATE);
    } else {
      setBody(builtInTemplate(type).body_template);
    }
    setSubject("{{subject}}");
  }

  function save() {
    startTransition(async () => {
      const res = await saveTemplateAction({ type, job_id: jobId || null, name, format, subject_template: subject, body_template: body });
      if (res.ok) {
        toast.success(res.message ?? "Saved.");
        if (res.data?.id) router.replace(`/email-formats/edit?id=${res.data.id}`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Format</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Email type" htmlFor="type">
              <NativeSelect id="type" value={type} onChange={(e) => setType(e.target.value as TemplateType)} disabled={!!template}>
                {TEMPLATE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EMAIL_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Used for" htmlFor="job">
              <NativeSelect id="job" value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={!!template || type === "digest"}>
                <option value="">All jobs</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    Only: {j.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Name (optional)" htmlFor="tname">
              <Input id="tname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Branded invite" />
            </Field>
            <Field label="Kind" htmlFor="format">
              <NativeSelect
                id="format"
                value={format}
                onChange={(e) => {
                  const f = e.target.value as "html" | "text";
                  setFormat(f);
                }}
              >
                <option value="html">HTML (designed email)</option>
                <option value="text">Plain text</option>
              </NativeSelect>
            </Field>
            <Field label="Subject" htmlFor="subject" className="sm:col-span-2" help="{{subject}} is the subject the AI writes. You can add text around it.">
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>{format === "html" ? "HTML" : "Text"}</CardTitle>
            <div className="flex gap-2">
              <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-xs font-medium shadow-sm hover:bg-accent">
                <Upload className="size-4" /> Upload file
                <input
                  type="file"
                  accept=".html,.htm,.txt,text/html,text/plain"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    void f.text().then((t) => {
                      setBody(t);
                      setFormat(/\.txt$/i.test(f.name) ? "text" : "html");
                      toast.success(`Loaded ${f.name}`);
                    });
                    e.target.value = "";
                  }}
                />
              </label>
              <ConfirmDialog
                trigger={
                  <Button type="button" size="sm" variant="outline">
                    <RotateCcw /> Start from default
                  </Button>
                }
                title="Replace with the built-in default?"
                description="Your changes in the editor will be replaced. Nothing is saved until you click Save."
                confirmLabel="Replace"
                onConfirm={() => loadDefault()}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              aria-label="Template"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={22}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder="Paste your HTML or text here"
            />
            {errors.length ? (
              <Alert variant="error" title="Fix these before saving">
                <ul className="list-disc space-y-1 pl-4">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <Alert variant="success">Looks good.</Alert>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              {template ? (
                <ConfirmDialog
                  trigger={
                    <Button type="button" variant="ghost">
                      <RotateCcw /> Reset to default
                    </Button>
                  }
                  title="Reset to the built-in default?"
                  description="This custom format is deleted and emails use the built-in format again."
                  confirmLabel="Reset"
                  destructive
                  onConfirm={() =>
                    startTransition(async () => {
                      const res = await resetTemplateAction(template.id);
                      if (res.ok) {
                        toast.success(res.message ?? "Reset.");
                        router.push("/email-formats");
                      } else toast.error(res.error);
                    })
                  }
                />
              ) : (
                <span />
              )}
              <Button type="button" onClick={save} disabled={pending || errors.length > 0}>
                {pending ? "Saving..." : "Save format"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Placeholders you can use</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              {Object.entries({ ...PLACEHOLDERS, ...SUBJECT_ONLY_PLACEHOLDERS }).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[minmax(0,180px)_1fr] gap-2">
                  <dt>
                    <code className="text-xs">{`{{${k}}}`}</code>
                  </dt>
                  <dd className="text-muted-foreground">
                    {v}
                    {k === "subject" ? " (subject line only)" : ""}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Show something only when a value exists: <code>{"{{#logo_url}}...{{/logo_url}}"}</code>. Only when empty:{" "}
              <code>{"{{^logo_url}}...{{/logo_url}}"}</code>.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Live preview</CardTitle>
          </CardHeader>
          <CardContent>
            {preview ? (
              <Tabs defaultValue="html">
                <TabsList>
                  <TabsTrigger value="html">Email</TabsTrigger>
                  <TabsTrigger value="text">Plain text</TabsTrigger>
                </TabsList>
                <p className="mt-3 text-sm">
                  <span className="text-muted-foreground">Subject:</span> <strong>{preview.subject}</strong>
                </p>
                <TabsContent value="html">
                  <EmailPreview html={preview.html} />
                </TabsContent>
                <TabsContent value="text">
                  <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 text-sm">{preview.text}</pre>
                </TabsContent>
              </Tabs>
            ) : (
              <Alert variant="warning">The preview could not be built. Check the errors on the left.</Alert>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Preview uses example data and your Settings branding.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
