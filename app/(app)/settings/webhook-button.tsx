"use client";
import { useTransition } from "react";
import { Plug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/validation";

export function WebhookButton({ action, disabled }: { action: () => Promise<ActionResult>; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      className="w-full"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const r = await action();
          if (r.ok) toast.success(r.message ?? "Connected.");
          else toast.error(r.error);
        })
      }
    >
      <Plug /> {pending ? "Connecting..." : "Connect replies to Brevo"}
    </Button>
  );
}
