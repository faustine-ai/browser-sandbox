import { Marked, type Tokens } from "marked";
import { highlight } from "./highlight";
import { LINKS } from "./links";
import { readmeSections, ghAnchor, type Section } from "./sections";

export { readmeSections, sectionBySlug, sectionMarkdown, ghAnchor, type Section } from "./sections";

/** README links point at GitHub anchors; on the site a section is a page. */
function rewriteHref(href: string, sections: Section[]): string {
  if (href.startsWith("#")) {
    const target = href.slice(1);
    const page = sections.find((s) => s.anchor === target);
    return page ? `/docs/${page.slug}/` : href;
  }
  if (/^[A-Z]+\.md$/i.test(href)) return `${LINKS.github}/blob/main/${href}`;
  return href;
}

type CodeToken = Tokens.Code & { html?: string };

/** Markdown → HTML with highlighted code, heading ids and page links. */
export async function renderMarkdown(md: string): Promise<string> {
  const { sections } = readmeSections();
  const marked = new Marked({ gfm: true, async: true });
  marked.use({
    async walkTokens(token) {
      if (token.type === "code") {
        const t = token as CodeToken;
        t.html = await highlight(t.text, t.lang || "text");
      }
    },
    renderer: {
      code(token) {
        const t = token as CodeToken;
        const html = t.html ?? `<pre class="shiki"><code>${escapeHtml(t.text)}</code></pre>`;
        // The architecture drawing in the README's intro is a fenced block without a language.
        return t.lang ? html : html.replace('<pre class="shiki', '<pre class="shiki ascii');
      },
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const raw = tokens.map((t) => ("text" in t ? (t as Tokens.Text).text : t.raw)).join("");
        const id = ghAnchor(raw);
        // The section's `##` is the page title; its `###` become the page's `h2`.
        const level = Math.max(2, depth - 1);
        return `<h${level} id="${id}">${text}</h${level}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const h = rewriteHref(href, sections);
        const ext = /^https?:/.test(h) ? ' target="_blank" rel="noreferrer"' : "";
        return `<a href="${h}"${title ? ` title="${title}"` : ""}${ext}>${text}</a>`;
      },
    },
  });
  const html = await marked.parse(md);
  return html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

