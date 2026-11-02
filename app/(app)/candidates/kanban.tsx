"use client";
import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { DndContext, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MAIN_STAGES, SIDE_STAGES, STAGE_LABELS, type Stage } from "@/lib/types";
import type { CandidateListItem } from "@/lib/data/candidates";
import { moveCandidateAction } from "./actions";

function Card({ c }: { c: CandidateListItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id, data: { stage: c.stage } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      aria-label={`${c.name}, ${STAGE_LABELS[c.stage]}. Press space to pick up and use arrow keys to move.`}
      className={cn(
        "cursor-grab touch-none rounded-lg border bg-card p-3 text-sm shadow-sm active:cursor-grabbing",
        isDragging && "z-10 opacity-80 shadow-lg ring-2 ring-primary",
      )}
    >
      <Link href={`/candidates/${c.id}`} className="font-medium hover:underline" onPointerDown={(e) => e.stopPropagation()}>
        {c.name}
      </Link>
      <p className="truncate text-xs text-muted-foreground">{c.job_title ?? "No job"}</p>
      {c.do_not_email ? <p className="mt-1 text-xs text-destructive">Do not email</p> : null}
    </div>
  );
}

function Column({ stage, items }: { stage: Stage; items: CandidateListItem[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      aria-label={STAGE_LABELS[stage]}
      className={cn("flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-muted/60 p-2", isOver && "ring-2 ring-primary")}
    >
      <h3 className="flex items-center justify-between px-1 text-sm font-semibold">
        {STAGE_LABELS[stage]} <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
      </h3>
      <div className="flex min-h-16 flex-col gap-2">
        {items.map((c) => (
          <Card key={c.id} c={c} />
        ))}
      </div>
    </section>
  );
}

export function Kanban({ candidates }: { candidates: CandidateListItem[] }) {
  const [, startTransition] = useTransition();
  const [items, move] = useOptimistic(candidates, (state, { id, stage }: { id: string; stage: Stage }) =>
    state.map((c) => (c.id === id ? { ...c, stage } : c)),
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  function onDragEnd(e: DragEndEvent) {
    const to = e.over?.id as Stage | undefined;
    const id = String(e.active.id);
    const from = e.active.data.current?.stage as Stage | undefined;
    if (!to || to === from) return;
    startTransition(async () => {
      move({ id, stage: to });
      const res = await moveCandidateAction(id, to);
      if (res.ok) toast.success(res.message ?? "Moved.");
      else toast.error(res.error);
    });
  }

  const byStage = (s: Stage) => items.filter((c) => c.stage === s);
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <p className="mb-2 text-xs text-muted-foreground">Drag a card to change its stage. Side stages are on the right.</p>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {MAIN_STAGES.map((s) => (
          <Column key={s} stage={s} items={byStage(s)} />
        ))}
        <div className="w-px shrink-0 bg-border" aria-hidden />
        {SIDE_STAGES.map((s) => (
          <Column key={s} stage={s} items={byStage(s)} />
        ))}
      </div>
    </DndContext>
  );
}
