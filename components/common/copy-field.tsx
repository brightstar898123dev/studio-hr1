"use client";
import { useState } from "react";
import { Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Read-only value with Copy, optionally hidden until "Show" is clicked. */
export function CopyField({ value, secret = false, label }: { value: string; secret?: boolean; label: string }) {
  const [shown, setShown] = useState(!secret);
  return (
    <div className="flex items-center gap-2">
      <code aria-label={label} className="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 text-xs">
        {shown ? value : value.replace(/[^/]+$/, "••••••••••••")}
      </code>
      {secret && !shown ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setShown(true)}>
          <Eye /> Show
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(
            () => toast.success("Copied."),
            () => toast.error("Could not copy. Select the text and copy it by hand."),
          );
        }}
      >
        <Copy /> Copy
      </Button>
    </div>
  );
}
