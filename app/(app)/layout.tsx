import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";
import { Nav } from "@/components/layout/nav";
import { signOutAction } from "./actions";

export const dynamic = "force-dynamic";

async function outboxCount(): Promise<number> {
  try {
    const db = await getDb();
    const rows = await db.query<{ n: number }>(
      "select count(*)::int as n from outbox where status in ('draft', 'needs_review', 'link_missing')",
    );
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const e = env();
  const waiting = await outboxCount();
  const modes = [e.mockDb && "demo database", e.mockEmail && "emails are not really sent", e.mockAi && "AI is simulated"].filter(
    Boolean,
  ) as string[];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>
      <aside className="bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <p className="text-base font-bold tracking-tight">HR Recruiting</p>
          <p className="hidden truncate text-xs text-sidebar-muted md:block" title={user.email}>
            {user.email}
          </p>
        </div>
        <div className="px-2 pb-2 md:flex-1 md:overflow-y-auto">
          <Nav counts={{ "/outbox": waiting }} />
        </div>
        <form action={signOutAction} className="hidden px-2 pb-4 md:block">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </form>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {modes.length > 0 ? (
          <div role="status" className="border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-xs font-medium">
            Test mode: {modes.join(", ")}.
          </div>
        ) : null}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 p-4 outline-none md:p-8">
          {children}
        </main>
        <form action={signOutAction} className="border-t p-4 md:hidden">
          <button type="submit" className="text-sm text-muted-foreground underline">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
