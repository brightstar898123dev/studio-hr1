"use client";
import { useState, useTransition } from "react";
import { Bot, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import type { ActionResult } from "@/lib/validation";
import { testAiAction } from "./actions";

export function TestButtons({ defaultTo, sendTest }: { defaultTo: string; sendTest?: () => Promise<ActionResult> }) {
  const [pending, start] = useTransition();
  const [last, setLast] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const res = await fn();
      setLast(res);
      if (res.ok) toast.success(res.message ?? "Done.");
      else toast.error(res.error);
    });
  return (
    <div className="space-y-3">
      {sendTest ? (
        <Button variant="outline" className="w-full" disabled={pending} onClick={() => run(sendTest)}>
          <Send /> Send test email to myself
        </Button>
      ) : null}
      {sendTest ? (
        <p className="text-xs text-muted-foreground">Goes to {defaultTo || "the digest address (set it first)"}.</p>
      ) : null}
      <Button variant="outline" className="w-full" disabled={pending} onClick={() => run(testAiAction)}>
        <Bot /> Test AI connection
      </Button>
      {last ? <Alert variant={last.ok ? "success" : "error"}>{last.ok ? last.message : last.error}</Alert> : null}
    </div>
  );
}
