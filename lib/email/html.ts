export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escaped text with line breaks turned into <br>. */
export function escapeMultiline(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, "<br>");
}
