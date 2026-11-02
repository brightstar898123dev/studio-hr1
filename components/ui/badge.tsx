import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-blue-800 dark:text-blue-200",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success/15 text-emerald-800 dark:text-emerald-200",
        warning: "border-transparent bg-warning/25 text-amber-900 dark:text-amber-200",
        destructive: "border-transparent bg-destructive/10 text-red-800 dark:text-red-200",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
