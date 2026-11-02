"use client";
import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Adds a Content-Security-Policy that blocks scripts, forms and plugins inside the preview. */
export function lockDown(html: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:;">`;
  const noScripts = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return /<head[^>]*>/i.test(noScripts) ? noScripts.replace(/<head([^>]*)>/i, `<head$1>${csp}`) : `${csp}${noScripts}`;
}

/**
 * Shows an email exactly as rendered, inside a sandboxed iframe:
 * no scripts, no same-origin access, no forms, no top navigation.
 */
export function EmailPreview({ html, title = "Email preview" }: { html: string; title?: string }) {
  const [mobile, setMobile] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant={mobile ? "ghost" : "secondary"} onClick={() => setMobile(false)} aria-pressed={!mobile}>
          <Monitor /> Desktop
        </Button>
        <Button type="button" size="sm" variant={mobile ? "secondary" : "ghost"} onClick={() => setMobile(true)} aria-pressed={mobile}>
          <Smartphone /> Phone
        </Button>
      </div>
      <div className="flex justify-center rounded-lg border bg-muted/50 p-2">
        <iframe
          title={title}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={lockDown(html)}
          className="h-[600px] rounded-md border bg-white transition-all"
          style={{ width: mobile ? 375 : "100%" }}
        />
      </div>
    </div>
  );
}
