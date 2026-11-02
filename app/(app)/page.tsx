import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Bot, CheckCircle2, Circle, Inbox, Link2Off, MessageSquare, Send } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/data/dashboard";
import { getSettings } from "@/lib/data/settings";
import { describeActivity, isProblem } from "@/lib/activity-format";
import { MAIN_STAGES, SIDE_STAGES, STAGE_LABELS } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatDate } from "@/components/common/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

function Stat({
  href,
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  href: string;
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardContent className="flex items-start justify-between gap-3 pt-5">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
            {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
          </div>
          <div
            className={cn(
              "rounded-lg p-2",
              tone === "warning" ? "bg-warning/20 text-amber-700 dark:text-amber-300" : tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
            )}
          >
            <Icon className="size-5" aria-hidden />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function HomePage() {
  await requireUser();
  const [d, settings] = await Promise.all([getDashboard(), getSettings()]);
  const total = Object.values(d.stageCounts).reduce((a, b) => a + b, 0);
  const steps = [
    { done: d.settingsReady, label: "Fill in your company and sender details", href: "/settings" },
    { done: d.jobs > 0, label: "Create a job with its description and Flowmingo link", href: "/jobs/new" },
    { done: d.candidates > 0, label: "Add or import candidates", href: "/candidates/import" },
    { done: d.templatesOrSent > 0, label: "Send a test email to yourself", href: "/settings" },
  ];
  const setupDone = steps.every((s) => s.done);

  return (
    <>
      <PageHeader title="Home" description="What needs you today, at a glance." />

      {!setupDone ? (
        <Card className="mb-6 border-primary/30">
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>Four quick steps before the app starts writing emails for you.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {steps.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-sm">
                  {s.done ? <CheckCircle2 className="size-4 text-success" aria-label="Done" /> : <Circle className="size-4 text-muted-foreground" aria-label="To do" />}
                  {s.done ? (
                    <span className="text-muted-foreground line-through">{s.label}</span>
                  ) : (
                    <Link href={s.href} className="font-medium text-primary hover:underline">
                      {s.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <section aria-label="Today" className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat href="/outbox?tab=draft" label="Drafts waiting" value={d.draftsWaiting} icon={Inbox} sub="Ready for your approval" />
        <Stat href="/outbox?tab=needs_review" label="Needs review" value={d.needsReview} icon={AlertTriangle} tone={d.needsReview ? "warning" : "default"} sub="Checker found issues" />
        <Stat href="/outbox?tab=link_missing" label="Link missing" value={d.linkMissing} icon={Link2Off} tone={d.linkMissing ? "warning" : "default"} sub="Invites need a link" />
        <Stat href="/activity?group=replies" label="Replies today" value={d.repliesToday} icon={MessageSquare} />
        <Stat
          href="/outbox?tab=sent"
          label="Sent today"
          value={`${d.sentToday}/${settings.daily_send_limit}`}
          icon={Send}
          tone={d.sentToday >= settings.daily_send_limit ? "warning" : "default"}
          sub={d.failed ? `${d.failed} failed` : "Daily limit"}
        />
        <Stat
          href="/settings"
          label="AI requests today"
          value={`${d.aiToday}/${d.aiLimit}`}
          icon={Bot}
          tone={d.aiToday >= d.aiLimit ? "danger" : d.aiToday >= d.aiLimit * 0.8 ? "warning" : "default"}
          sub="Free tier is about 50 a day"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Candidates by stage</CardTitle>
            <CardDescription>{total} in total</CardDescription>
          </CardHeader>
          <CardContent>
            {total === 0 ? (
              <EmptyState title="No candidates yet" description="Add candidates to see your pipeline here." className="py-8" />
            ) : (
              <ul className="space-y-2">
                {[...MAIN_STAGES, ...SIDE_STAGES]
                  .filter((s) => d.stageCounts[s])
                  .map((s) => {
                    const n = d.stageCounts[s] ?? 0;
                    return (
                      <li key={s}>
                        <Link href={`/candidates?stage=${s}`} className="block rounded-md p-1 hover:bg-muted">
                          <div className="flex justify-between text-sm">
                            <span>{STAGE_LABELS[s]}</span>
                            <span className="tabular-nums text-muted-foreground">{n}</span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden>
                            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(4, (n / total) * 100)}%` }} />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent activity</CardTitle>
            </div>
            <Link href="/activity" className="text-sm text-primary hover:underline">
              See all
            </Link>
          </CardHeader>
          <CardContent>
            {d.recent.length === 0 ? (
              <EmptyState title="Nothing yet" description="Everything the app and you do is listed here." className="py-8" />
            ) : (
              <ul className="space-y-3">
                {d.recent.map((a) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", isProblem(a.action) ? "bg-destructive" : "bg-primary/60")} aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate">{describeActivity(a)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(a.created_at)} · {a.actor}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
