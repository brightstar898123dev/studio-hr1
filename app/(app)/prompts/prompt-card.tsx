"use client";
import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { resetPromptAction, savePromptAction } from "./actions";

export function PromptCard({
  type,
  title,
  explanation,
  current,
  defaultText,
  custom,
}: {
  type: string;
  title: string;
  explanation: string;
  current: string;
  defaultText: string;
  custom: boolean;
}) {
  const [text, setText] = useState(current);
  const [pending, start] = useTransition();
  const dirty = text !== current;
  return (
    <Card id={type}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{title}</CardTitle>
          <Badge variant={custom ? "default" : "secondary"}>{custom ? "Customised" : "Default"}</Badge>
        </div>
        <CardDescription>{explanation}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea aria-label={`${title} prompt`} rows={10} value={text} onChange={(e) => setText(e.target.value)} className="text-[13px]" />
        <div className="flex flex-wrap justify-between gap-2">
          {custom ? (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" disabled={pending}>
                  <RotateCcw /> Reset to default
                </Button>
              }
              title="Reset this prompt?"
              description="Your custom text is removed and the built-in default is used again."
              confirmLabel="Reset"
              onConfirm={() =>
                start(async () => {
                  const res = await resetPromptAction(type);
                  if (res.ok) {
                    setText(defaultText);
                    toast.success(res.message ?? "Reset.");
                  } else toast.error(res.error);
                })
              }
            />
          ) : (
            <span />
          )}
          <Button
            size="sm"
            disabled={pending || !dirty}
            onClick={() =>
              start(async () => {
                const res = await savePromptAction(type, text);
                if (res.ok) toast.success(res.message ?? "Saved.");
                else toast.error(res.error);
              })
            }
          >
            {pending ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
