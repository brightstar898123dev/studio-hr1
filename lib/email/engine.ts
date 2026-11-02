/**
 * A tiny, safe template language:
 *   {{name}}                    value (HTML-escaped in HTML templates, except {{body}})
 *   {{#name}} ... {{/name}}     shown only when name has a value
 *   {{^name}} ... {{/name}}     shown only when name is empty
 * Nothing else is evaluated.
 */

const SECTION_RE = /\{\{([#^])\s*([a-z_]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g;
const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export type Escaper = (name: string, value: string) => string;

export function renderTemplate(template: string, data: Record<string, string>, escape: Escaper): string {
  let out = template;
  // Sections can contain variables but not other sections of the same name.
  for (let i = 0; i < 5 && SECTION_RE.test(out); i++) {
    SECTION_RE.lastIndex = 0;
    out = out.replace(SECTION_RE, (_m, kind: string, name: string, inner: string) => {
      const has = (data[name] ?? "").trim() !== "";
      return (kind === "#" ? has : !has) ? inner : "";
    });
  }
  SECTION_RE.lastIndex = 0;
  return out.replace(VAR_RE, (_m, name: string) => (name in data ? escape(name, data[name] ?? "") : _m));
}

/** All placeholder names used in a template (variables and sections). */
export function placeholdersIn(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*[#^/]?\s*([A-Za-z0-9_.-]+)\s*\}\}/g)) names.add(m[1]!);
  return [...names];
}
