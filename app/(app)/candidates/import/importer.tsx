"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, NativeSelect, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { isValidEmail } from "@/lib/validation";
import type { ImportResult, ImportRow } from "@/lib/data/candidates";
import type { JobOption } from "../candidate-fields";
import { importCandidatesAction } from "../actions";

const TARGETS = [
  { key: "name", label: "Name", required: true, guesses: ["name", "full name", "candidate", "candidate name"] },
  { key: "email", label: "Email", required: true, guesses: ["email", "e-mail", "email address", "mail"] },
  { key: "phone", label: "Phone", required: false, guesses: ["phone", "mobile", "phone number", "contact"] },
  { key: "source", label: "Source", required: false, guesses: ["source", "channel", "from"] },
  { key: "profile_notes", label: "Profile notes", required: false, guesses: ["notes", "profile", "summary", "experience", "profile notes"] },
] as const;
type TargetKey = (typeof TARGETS)[number]["key"];

function guess(headers: string[], options: readonly string[]): string {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const g of options) {
    const i = lower.indexOf(g);
    if (i >= 0) return headers[i]!;
  }
  for (const g of options) {
    const i = lower.findIndex((h) => h.includes(g));
    if (i >= 0) return headers[i]!;
  }
  return "";
}

export function Importer({ jobs, defaultJobId }: { jobs: JobOption[]; defaultJobId?: string }) {
  const [raw, setRaw] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<TargetKey, string>>({ name: "", email: "", phone: "", source: "", profile_notes: "" });
  const [jobId, setJobId] = useState(defaultJobId ?? "");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function parse(text: string) {
    setResult(null);
    const out = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
    const hs = (out.meta.fields ?? []).filter(Boolean);
    if (hs.length === 0 || out.data.length === 0) {
      toast.error("Could not read any rows. The first line must be the column names.");
      return;
    }
    setHeaders(hs);
    setData(out.data);
    setMapping({
      name: guess(hs, TARGETS[0].guesses),
      email: guess(hs, TARGETS[1].guesses),
      phone: guess(hs, TARGETS[2].guesses),
      source: guess(hs, TARGETS[3].guesses),
      profile_notes: guess(hs, TARGETS[4].guesses),
    });
  }

  const rows: ImportRow[] = useMemo(
    () =>
      data.map((r) => {
        const pick = (k: TargetKey) => (mapping[k] ? (r[mapping[k]] ?? "").trim() : undefined);
        return { name: pick("name"), email: pick("email"), phone: pick("phone"), source: pick("source"), profile_notes: pick("profile_notes") };
      }),
    [data, mapping],
  );
  const problems = rows.map((r) => (!r.name ? "Missing name" : !isValidEmail(r.email) ? "Invalid email" : null));
  const validCount = problems.filter((p) => p === null).length;
  const ready = !!mapping.name && !!mapping.email && validCount > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose a file</CardTitle>
          <CardDescription>Export your spreadsheet as CSV. The first row must contain column names.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-sm hover:bg-muted/50">
            <Upload className="size-4" /> Choose a CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void f.text().then((t) => {
                  setRaw(t);
                  parse(t);
                });
              }}
            />
          </label>
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">Or paste the CSV text</summary>
            <Textarea className="mt-2 font-mono text-xs" rows={6} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"name,email,phone\nAsha Rao,asha@example.com,98450..."} />
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => parse(raw)}>
              Read pasted text
            </Button>
          </details>
        </CardContent>
      </Card>

      {headers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Match the columns</CardTitle>
            <CardDescription>We guessed the matches. Change them if they look wrong.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {TARGETS.map((t) => (
              <Field key={t.key} label={`${t.label}${t.required ? "" : " (optional)"}`} htmlFor={`map-${t.key}`}>
                <NativeSelect id={`map-${t.key}`} value={mapping[t.key]} onChange={(e) => setMapping({ ...mapping, [t.key]: e.target.value })}>
                  <option value="">{t.required ? "Choose a column" : "Do not import"}</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ))}
            <Field label="Add them to job" htmlFor="import-job">
              <NativeSelect id="import-job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">No job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </CardContent>
        </Card>
      ) : null}

      {headers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Check and import</CardTitle>
            <CardDescription>
              {data.length} rows found, {validCount} ready to import. Emails that already exist are skipped.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <THead>
                <TR>
                  <TH>#</TH>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Phone</TH>
                  <TH>Check</TH>
                </TR>
              </THead>
              <TBody>
                {rows.slice(0, 20).map((r, i) => (
                  <TR key={i}>
                    <TD className="text-muted-foreground">{i + 1}</TD>
                    <TD>{r.name || "-"}</TD>
                    <TD>{r.email || "-"}</TD>
                    <TD>{r.phone || "-"}</TD>
                    <TD>{problems[i] ? <Badge variant="destructive">{problems[i]}</Badge> : <Badge variant="success">OK</Badge>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {rows.length > 20 ? <p className="text-xs text-muted-foreground">Showing the first 20 rows.</p> : null}
            <Button
              disabled={!ready || pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await importCandidatesAction(rows, jobId || null);
                  setResult(res);
                  toast.success(`${res.created} candidate${res.created === 1 ? "" : "s"} imported.`);
                })
              }
            >
              {pending ? "Importing..." : `Import ${validCount} candidate${validCount === 1 ? "" : "s"}`}
            </Button>
            {result ? (
              <Alert variant={result.created > 0 ? "success" : "warning"} title={`${result.created} imported`}>
                {result.duplicates.length ? <p>{result.duplicates.length} skipped because the email already exists.</p> : null}
                {result.invalid.length ? <p>{result.invalid.length} skipped because of missing or invalid data.</p> : null}
                <Link href="/candidates" className="mt-2 inline-block font-medium underline">
                  Go to candidates
                </Link>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
