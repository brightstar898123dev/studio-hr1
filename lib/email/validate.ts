import { placeholdersIn } from "./engine";
import { PLACEHOLDERS, SUBJECT_ONLY_PLACEHOLDERS } from "./placeholders";
import type { TemplateType } from "@/lib/types";

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);
// Tags browsers close on their own; we do not require explicit closing.
const OPTIONAL_CLOSE = new Set(["p", "li", "td", "th", "tr", "thead", "tbody", "tfoot", "option", "colgroup", "dt", "dd"]);

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** Checks that HTML tags are properly opened and closed, and that nothing unsafe is present. */
export function checkHtml(html: string): string[] {
  const errors: string[] = [];
  const stripped = html.replace(/<!--[\s\S]*?-->/g, (m) => " ".repeat(m.length));
  if (/<script\b/i.test(stripped)) errors.push("Scripts (<script>) are not allowed in emails.");
  if (/\son[a-z]+\s*=/i.test(stripped)) errors.push("Event handlers like onclick= are not allowed in emails.");
  if (/javascript:/i.test(stripped)) errors.push("javascript: links are not allowed in emails.");
  if (/<(iframe|object|embed|form)\b/i.test(stripped)) errors.push("Frames, forms and embedded objects do not work in emails.");

  const stack: { tag: string; line: number }[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  // Inside <style>, skip CSS (it can contain ">" characters).
  const withoutStyle = stripped.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, a: string, css: string, c: string) => a + " ".repeat(css.length) + c);
  for (const m of withoutStyle.matchAll(tagRe)) {
    const closing = m[1] === "/";
    const tag = m[2]!.toLowerCase();
    const selfClosing = m[4] === "/";
    const line = lineOf(html, m.index ?? 0);
    if (VOID.has(tag) || selfClosing) continue;
    if (!closing) {
      stack.push({ tag, line });
      continue;
    }
    // Close optional-close tags implicitly until we find the match.
    let idx = stack.length - 1;
    while (idx >= 0 && stack[idx]!.tag !== tag && OPTIONAL_CLOSE.has(stack[idx]!.tag)) idx--;
    if (idx < 0 || stack[idx]!.tag !== tag) {
      errors.push(`Line ${line}: </${tag}> does not match any open <${tag}> tag.`);
      continue;
    }
    stack.length = idx;
  }
  for (const open of stack) {
    if (!OPTIONAL_CLOSE.has(open.tag)) errors.push(`Line ${open.line}: <${open.tag}> is never closed.`);
  }
  // Any "<" that does not start a tag, comment or doctype (likely a typo).
  const stray = withoutStyle.match(/<(?![a-zA-Z/!])/);
  if (stray && stray.index !== undefined) errors.push(`Line ${lineOf(html, stray.index)}: a "<" is not part of any tag.`);
  return errors;
}

function checkSections(template: string): string[] {
  const errors: string[] = [];
  const open: string[] = [];
  for (const m of template.matchAll(/\{\{\s*([#^/])\s*([a-z_]+)\s*\}\}/g)) {
    if (m[1] === "/") {
      if (open[open.length - 1] === m[2]) open.pop();
      else errors.push(`{{/${m[2]}}} closes a section that was not opened.`);
    } else open.push(m[2]!);
  }
  for (const o of open) errors.push(`{{#${o}}} is opened but never closed with {{/${o}}}.`);
  return errors;
}

export type TemplateInput = {
  type: TemplateType;
  format: "html" | "text";
  subject_template: string;
  body_template: string;
};

/** Returns plain-English problems. An empty list means the template can be saved. */
export function validateTemplate(t: TemplateInput): string[] {
  const errors: string[] = [];
  const bodyNames = new Set(Object.keys(PLACEHOLDERS));
  const subjectNames = new Set([...Object.keys(PLACEHOLDERS), ...Object.keys(SUBJECT_ONLY_PLACEHOLDERS)]);

  if (!t.subject_template.trim()) errors.push("The subject line is empty. Use {{subject}} to use the AI's subject.");
  if (t.subject_template.length > 300) errors.push("The subject template is too long.");
  if (/[\r\n]/.test(t.subject_template)) errors.push("The subject must be a single line.");
  for (const name of placeholdersIn(t.subject_template)) {
    if (!subjectNames.has(name)) errors.push(`Unknown placeholder in subject: {{${name}}}`);
  }

  if (!t.body_template.trim()) errors.push("The email body template is empty.");
  for (const name of placeholdersIn(t.body_template)) {
    if (!bodyNames.has(name)) errors.push(`Unknown placeholder: {{${name}}}. See the list of placeholders you can use.`);
  }
  if (!/\{\{\s*body\s*\}\}/.test(t.body_template)) errors.push("The template must include {{body}}, where the email text goes.");
  if (t.type === "interview_invite" && !/\{\{\s*interview_link\s*\}\}/.test(t.body_template)) {
    errors.push("Interview invite templates must include {{interview_link}}.");
  }
  // Placeholders with spaces or odd characters, e.g. {{ Candidate Name }}
  const malformed = t.body_template.match(/\{\{(?!\s*[#^/]?\s*[a-z_]+\s*\}\})[^}]*\}\}/);
  if (malformed) errors.push(`"${malformed[0]}" is not a valid placeholder. Use lower case with underscores, e.g. {{candidate_name}}.`);
  if (/\{\{(?![^{}]*\}\})/.test(t.body_template)) errors.push('A placeholder is missing its closing "}}".');

  errors.push(...checkSections(t.body_template));
  if (t.format === "html") errors.push(...checkHtml(t.body_template));
  return [...new Set(errors)];
}
