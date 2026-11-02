import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-1 text-muted-foreground [&_svg]:size-8">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: "info" | "warning" | "error" | "success";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-primary/30 bg-primary/5",
    warning: "border-warning/50 bg-warning/10",
    error: "border-destructive/40 bg-destructive/5 text-destructive",
    success: "border-success/40 bg-success/10",
  }[variant];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("rounded-lg border p-3 text-sm", styles, className)}>
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn(title && "mt-1")}>{children}</div> : null}
    </div>
  );
}
