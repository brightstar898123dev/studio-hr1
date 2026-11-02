import { bodyToHtml, bodyToText } from "./body";
import { DEFAULT_TEXT_TEMPLATE } from "./defaults";
import { renderTemplate } from "./engine";
import { escapeHtml, escapeMultiline } from "./html";
import type { TemplateData } from "./placeholders";

export type TemplateLike = { format: "html" | "text"; subject_template: string; body_template: string };
export type RenderedEmail = { subject: string; html: string; text: string };

/**
 * Renders the AI's {subject, body} into the chosen template.
 * Always returns an HTML version and a clean plain-text version.
 */
export function renderEmail(template: TemplateLike, data: TemplateData): RenderedEmail {
  const textData: Record<string, string> = { ...data, body: bodyToText(data.body) };

  const subject = renderTemplate(template.subject_template, data, (_n, v) => v)
    .replace(/\s+/g, " ")
    .trim();

  const text = tidyText(
    renderTemplate(template.format === "text" ? template.body_template : DEFAULT_TEXT_TEMPLATE, textData, (_n, v) => v),
  );

  let html: string;
  if (template.format === "html") {
    html = renderTemplate(template.body_template, data, (name, value) => {
      if (name === "body") return bodyToHtml(value);
      if (name === "signature" || name === "unsubscribe_text") return escapeMultiline(value);
      return escapeHtml(value);
    });
  } else {
    // Text templates still get a simple, readable HTML version.
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;"><div style="max-width:600px;margin:0 auto;padding:16px;">${linkifyLink(escapeMultiline(text), data.interview_link)}</div></body></html>`;
  }
  return { subject, html, text };
}

function linkifyLink(escapedText: string, link: string): string {
  if (!link) return escapedText;
  const safe = escapeHtml(link);
  return escapedText.split(safe).join(`<a href="${safe}">${safe}</a>`);
}

function tidyText(s: string): string {
  return s
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
