"use client";
import * as React from "react";
import { Dialog as D, AlertDialog as A } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-card p-6 shadow-lg",
          className,
        )}
        {...props}
      >
        <div className="space-y-1">
          <D.Title className="text-lg font-semibold">{title}</D.Title>
          {description ? (
            <D.Description className="text-sm text-muted-foreground">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{title}</D.Description>
          )}
        </div>
        {children}
        <D.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100" aria-label="Close">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

/** Side drawer (used for the Outbox email detail). */
export function SheetContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <D.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto border-l bg-card p-6 shadow-xl",
          className,
        )}
        {...props}
      >
        <div className="space-y-1 pr-8">
          <D.Title className="text-lg font-semibold">{title}</D.Title>
          {description ? (
            <D.Description className="text-sm text-muted-foreground">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{title}</D.Description>
          )}
        </div>
        {children}
        <D.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100" aria-label="Close">
          <X className="size-5" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

/** "Are you sure?" dialog. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Yes, continue",
  destructive = false,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <A.Root>
      <A.Trigger asChild>{trigger}</A.Trigger>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <A.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-card p-6 shadow-lg">
          <A.Title className="text-lg font-semibold">{title}</A.Title>
          <A.Description className="text-sm text-muted-foreground">{description}</A.Description>
          <div className="flex justify-end gap-2">
            <A.Cancel className={buttonVariants({ variant: "outline" })}>Cancel</A.Cancel>
            <A.Action
              className={buttonVariants({ variant: destructive ? "destructive" : "default" })}
              onClick={() => void onConfirm()}
            >
              {confirmLabel}
            </A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
