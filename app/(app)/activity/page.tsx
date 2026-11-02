import type { Metadata } from "next";
import Link from "next/link";
import { Activity } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ACTIVITY_GROUPS, describeActivity, isProblem } from "@/lib/activity-format";
import type { ActivityRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/components/common/status";

export const metadata: Metadata = { title: "Activity Log" };

const PAGE = 100;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; actor?: string; q?: string; problems?: string; page?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const where: string[] = [];
  const params: unknown[] = [];
  const group = sp.group && sp.group in ACTIVITY_GROUPS ? ACTIVITY_GROUPS[sp.group as keyof typeof ACTIVITY_GROUPS] : null;
  if (group) {
    const ors = group.prefixes.map((p) => {
      params.push(`${p}%`);
      return `a.action like $${params.length}`;
    });
    where.push(`(${ors.join(" or ")})`);
  }
  if (sp.actor) {
    params.push(sp.actor);
    where.push(`a.actor = $${params.length}`);
  }
  if (sp.problems === "1") where.push("a.action ~ '(failed|error|invalid|bounce|blocked)'");
  if (sp.q) {
    params.push(`%${sp.q}%`);
    where.push(`(a.action ilike $${params.length} or a.details::text ilike $${params.length} or c.name ilike $${params.length})`);
  }
  params.push(PAGE + 1, (page - 1) * PAGE);
  const db = await getDb();
  const rows = await db.query<ActivityRow & { candidate_name: string | null; candidate_id: string | null }>(
    `select a.*, c.name as candidate_name, c.id as candidate_id from activity_log a
     left join candidates c on (a.entity = 'candidate' and c.id::text = a.entity_id)
        or (a.entity = 'outbox' and c.id::text = a.details->>'candidate_id')
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by a.created_at desc limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  const hasMore = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") u.set(k, v);
    u.set("page", String(p));
    return `/activity?${u.toString()}`;
  };

  return (
    <>
      <PageHeader title="Activity Log" description="Everything the app did automatically and everything you changed." />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_220px_160px_auto_auto]" role="search">
        <Input name="q" defaultValue={sp.q} placeholder="Search (name, email, error...)" aria-label="Search" />
        <NativeSelect name="group" defaultValue={sp.group ?? ""} aria-label="Filter by kind">
          <option value="">Everything</option>
          {Object.entries(ACTIVITY_GROUPS).map(([k, g]) => (
            <option key={k} value={k}>
              {g.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="actor" defaultValue={sp.actor ?? ""} aria-label="Filter by who">
          <option value="">Anyone</option>
          <option value="hr">You (HR)</option>
          <option value="cron">Scheduled jobs</option>
          <option value="webhook">Incoming emails</option>
          <option value="system">System</option>
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="problems" value="1" defaultChecked={sp.problems === "1"} /> Problems only
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {list.length === 0 ? (
        <EmptyState icon={<Activity />} title="Nothing found" description="Try other filters, or come back after the app has done some work." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>What happened</TH>
                <TH className="hidden md:table-cell">Candidate</TH>
                <TH className="hidden md:table-cell">By</TH>
              </TR>
            </THead>
            <TBody>
              {list.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDate(a.created_at)}</TD>
                  <TD>
                    <span className={isProblem(a.action) ? "text-destructive" : undefined}>{describeActivity(a)}</span>
                  </TD>
                  <TD className="hidden md:table-cell">
                    {a.candidate_id ? (
                      <Link href={`/candidates/${a.candidate_id}`} className="hover:underline">
                        {a.candidate_name}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </TD>
                  <TD className="hidden md:table-cell">
                    <Badge variant="secondary">{{ hr: "You", cron: "Schedule", webhook: "Email in", system: "System" }[a.actor] ?? a.actor}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <div className="mt-4 flex justify-between">
        {page > 1 ? (
          <Button asChild variant="outline">
            <Link href={qs(page - 1)}>Newer</Link>
          </Button>
        ) : (
          <span />
        )}
        {hasMore ? (
          <Button asChild variant="outline">
            <Link href={qs(page + 1)}>Older</Link>
          </Button>
        ) : null}
      </div>
    </>
  );
}
