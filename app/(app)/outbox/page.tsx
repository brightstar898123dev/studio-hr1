import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/data/settings";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { OutboxTable, type OutboxListRow } from "./outbox-table";

export const metadata: Metadata = { title: "Outbox" };

const TABS = [
  { key: "draft", label: "Needs approval", statuses: ["draft"], empty: "No drafts waiting. New drafts appear here after the scheduled jobs run." },
  { key: "needs_review", label: "Needs review", statuses: ["needs_review"], empty: "Nothing needs review. Emails the checker is unsure about appear here." },
  { key: "link_missing", label: "Link missing", statuses: ["link_missing"], empty: "No invites are waiting for an interview link." },
  { key: "approved", label: "Approved", statuses: ["approved", "sending"], empty: "No approved emails waiting to be sent." },
  { key: "sent", label: "Sent", statuses: ["sent"], empty: "Nothing sent yet." },
  { key: "failed", label: "Failed", statuses: ["failed"], empty: "No failed emails." },
] as const;

export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; open?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const [counts, settings] = await Promise.all([
    db.query<{ status: string; n: number }>("select status, count(*)::int as n from outbox group by status"),
    getSettings(),
  ]);
  const countOf = (statuses: readonly string[]) => counts.filter((c) => statuses.includes(c.status)).reduce((a, c) => a + c.n, 0);

  let openStatus: string | undefined;
  if (sp.open) openStatus = (await db.query<{ status: string }>("select status from outbox where id = $1", [sp.open]))[0]?.status;
  const tab =
    TABS.find((t) => t.key === sp.tab) ?? TABS.find((t) => openStatus && (t.statuses as readonly string[]).includes(openStatus)) ?? TABS[0];

  const rows = await db.query<OutboxListRow>(
    `select o.id, c.name as candidate_name, j.title as job_title, o.type, o.subject, o.checker_score, o.checker_issues,
            o.created_at, o.sent_at, o.error, o.reply_category
     from outbox o join candidates c on c.id = o.candidate_id left join jobs j on j.id = o.job_id
     where o.status = any($1::text[])
     order by ${tab.key === "sent" ? "o.sent_at desc" : "o.created_at asc"} limit 300`,
    [tab.statuses],
  );
  const e = env();

  return (
    <>
      <PageHeader
        title="Outbox"
        description={
          <>
            Every email waits here until it is approved{settings.auto_send ? " (automatic sending is on for emails that pass both checks)" : ""}. Approved emails
            are sent by the scheduled job, up to {settings.daily_send_limit} a day.
            {e.mockEmail ? " Test mode: emails are recorded, not really sent." : ""}
          </>
        }
      />
      <nav aria-label="Outbox tabs" className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {TABS.map((t) => {
          const n = countOf(t.statuses);
          return (
            <Link
              key={t.key}
              href={`/outbox?tab=${t.key}`}
              aria-current={t.key === tab.key ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground",
                t.key === tab.key && "bg-card text-foreground shadow-sm",
              )}
            >
              {t.label}
              {n ? <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">{n}</span> : null}
            </Link>
          );
        })}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={<Inbox />} title={tab.label} description={tab.empty} />
      ) : (
        <OutboxTable key={tab.key} rows={rows} selectable={tab.key === "draft"} openId={sp.open} />
      )}
    </>
  );
}
