import { createHighlighter, type Highlighter } from "shiki";

// One highlighter for the whole build (the pages are prerendered once).
let instance: Promise<Highlighter> | null = null;

const LANGS = ["ts", "tsx", "js", "sh", "bash", "nginx", "json", "html", "text"] as const;
type Lang = (typeof LANGS)[number];

function highlighter() {
  if (!instance) instance = createHighlighter({ themes: ["github-dark-default"], langs: [...LANGS] });
  return instance;
}

export async function highlight(code: string, lang = "ts"): Promise<string> {
  const h = await highlighter();
  const l = (LANGS as readonly string[]).includes(lang) ? (lang as Lang) : "text";
  return h.codeToHtml(code, { lang: l, theme: "github-dark-default" });
}
