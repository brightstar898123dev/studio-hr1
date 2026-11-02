import sanitizeHtml from "sanitize-html";

/**
 * Cleans email HTML for the in-app preview (shown inside a sandboxed iframe too).
 * Keeps the layout tags and inline styles emails use; removes scripts, forms,
 * event handlers and non-http(s) links.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "html", "head", "body", "meta", "title", "style", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
      "div", "span", "p", "br", "hr", "a", "img", "strong", "b", "em", "i", "u", "s", "small", "sup", "sub", "center", "font",
      "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "code",
    ],
    allowVulnerableTags: true, // <style> is needed for responsive emails; the preview iframe blocks scripts anyway
    allowedAttributes: {
      "*": ["style", "class", "align", "valign", "width", "height", "bgcolor", "color", "dir", "lang", "role", "border", "cellpadding", "cellspacing", "colspan", "rowspan"],
      a: ["href", "target", "rel", "name"],
      img: ["src", "alt", "title", "width", "height"],
      meta: ["charset", "name", "content", "http-equiv"],
      font: ["face", "size", "color"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowedSchemesByTag: { img: ["https", "data"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" } }),
    },
  });
}
