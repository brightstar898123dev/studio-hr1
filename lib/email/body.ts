import { escapeHtml } from "./html";

/**
 * The AI writes plain paragraphs with light markdown (**bold**, *italic*, "- " bullets).
 * We turn that into email-safe HTML (escaped, inline styles) and clean plain text.
 */

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
}

const P_STYLE = "margin:0 0 16px 0;font-size:16px;line-height:1.6;";

export function bodyToHtml(body: string): string {
  const blocks = body.replace(/\r\n/g, "\n").trim().split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trimEnd());
      if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
        const items = lines.map((l) => `<li style="margin:0 0 6px 0;">${inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("");
        return `<ul style="margin:0 0 16px 0;padding-left:22px;font-size:16px;line-height:1.6;">${items}</ul>`;
      }
      return `<p style="${P_STYLE}">${lines.map(inline).join("<br>")}</p>`;
    })
    .join("\n");
}

export function bodyToText(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1$2")
    .replace(/^\s*[*•]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
