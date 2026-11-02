"use client";
import { useMemo, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/input";

/** Markdown textarea with a Preview tab. Submits as a normal form field. */
export function MarkdownEditor({
  name,
  id,
  defaultValue = "",
  value: controlled,
  onChange,
  rows = 14,
  placeholder,
}: {
  name: string;
  id?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const value = controlled ?? inner;
  const html = useMemo(() => renderMarkdown(value), [value]);
  return (
    <Tabs defaultValue="write">
      <TabsList>
        <TabsTrigger value="write">Write</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>
      <TabsContent value="write" forceMount className="data-[state=inactive]:hidden">
        <Textarea
          id={id}
          name={name}
          rows={rows}
          value={value}
          placeholder={placeholder}
          className="font-mono text-[13px]"
          onChange={(e) => {
            setInner(e.target.value);
            onChange?.(e.target.value);
          }}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Markdown: <code># Heading</code>, <code>**bold**</code>, <code>- list item</code>.
        </p>
      </TabsContent>
      <TabsContent value="preview">
        {value.trim() ? (
          <div className="prose-md min-h-40 rounded-md border bg-card p-4 text-sm" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">Nothing to preview yet.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
