import { Marked, type Tokens } from "marked";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeHref(href: string): string | null {
  const h = href.trim();
  return /^(https?:|mailto:)/i.test(h) ? h : null;
}

/**
 * Markdown -> safe HTML. Raw HTML in the markdown is shown as text (never run),
 * and only http(s)/mailto links are kept. Works in the browser and on the server.
 */
const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    },
    link(token: Tokens.Link) {
      const text = this.parser.parseInline(token.tokens);
      const href = safeHref(token.href);
      if (!href) return text;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    image(token: Tokens.Image) {
      return escapeHtml(token.text ?? "");
    },
  },
});

export function renderMarkdown(source: string): string {
  return md.parse(source ?? "", { async: false }) as string;
}
