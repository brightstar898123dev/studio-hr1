"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Briefcase, FileText, House, Inbox, Mail, Settings, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "Home", icon: House },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/outbox", label: "Outbox", icon: Inbox },
  { href: "/email-formats", label: "Email Formats", icon: Mail },
  { href: "/prompts", label: "Prompts", icon: Sparkles },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/activity", label: "Activity Log", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Nav({ counts }: { counts?: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        const count = counts?.[href];
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-sidebar-foreground",
              active && "bg-sidebar-active text-sidebar-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span>{label}</span>
            {count ? (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
