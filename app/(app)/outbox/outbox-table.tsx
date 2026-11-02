"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, ScoreBadge } from "@/components/common/status";
import { EMAIL_TYPE_LABELS, type CheckerIssue, type EmailType } from "@/lib/types";
import { approveAction } from "./actions";
import { OutboxDrawer } from "./drawer";

export type OutboxListRow = {
  id: string;
  candidate_name: string;
  job_title: string | null;
  type: EmailType;
  subject: string;
  checker_score: number | null;
  checker_issues: CheckerIssue[];
  created_at: string;
  sent_at: string | null;
  error: string | null;
  reply_category: string | null;
};

export function OutboxTable({ rows, selectable, openId }: { rows: OutboxListRow[]; selectable: boolean; openId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(openId ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <>
      {selectable ? (
        <div className="mb-3 flex items-center gap-2">
          <Button
            size="sm"
            disabled={selected.size === 0 || pending}
            onClick={() =>
              start(async () => {
                const res = await approveAction([...selected]);
                if (res.ok) toast.success(res.message ?? "Approved.");
                else toast.error(res.error);
                setSelected(new Set());
                router.refresh();
              })
            }
          >
            <CheckCheck /> Approve selected ({selected.size})
          </Button>
        </div>
      ) : null}
      <Card>
        <Table>
          <THead>
            <TR>
              {selectable ? (
                <TH className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </TH>
              ) : null}
              <TH>Candidate</TH>
              <TH>Type</TH>
              <TH>Subject</TH>
              <TH>Score</TH>
              <TH className="hidden lg:table-cell">Issues</TH>
              <TH className="hidden md:table-cell">When</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id} className="cursor-pointer" onClick={() => setOpen(r.id)}>
                {selectable ? (
                  <TD onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${r.candidate_name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </TD>
                ) : null}
                <TD>
                  <button type="button" className="text-left font-medium hover:underline" onClick={() => setOpen(r.id)}>
                    {r.candidate_name}
                  </button>
                  <p className="text-xs text-muted-foreground">{r.job_title ?? "No job"}</p>
                </TD>
                <TD className="whitespace-nowrap">
                  {EMAIL_TYPE_LABELS[r.type]}
                  {r.reply_category ? <p className="text-xs text-muted-foreground">{r.reply_category.replace(/_/g, " ")}</p> : null}
                </TD>
                <TD className="max-w-xs truncate">{r.subject || <span className="text-muted-foreground">-</span>}</TD>
                <TD>
                  <ScoreBadge score={r.checker_score} />
                </TD>
                <TD className="hidden max-w-sm lg:table-cell">
                  {r.error ? (
                    <span className="text-xs text-destructive">{r.error}</span>
                  ) : r.checker_issues.length ? (
                    <span className="text-xs text-muted-foreground">
                      {r.checker_issues[0]!.message}
                      {r.checker_issues.length > 1 ? ` (+${r.checker_issues.length - 1} more)` : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </TD>
                <TD className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatDate(r.sent_at ?? r.created_at)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <OutboxDrawer
        id={open}
        onClose={() => {
          setOpen(null);
          router.refresh();
        }}
      />
    </>
  );
}
