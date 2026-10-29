import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LINKS, PACKAGE, SITE } from "./links.ts";

/**
 * The docs are the README, split at its `##` headings into one page each.
 * Nothing here is written twice: the README stays the single source (it is
 * what npm and GitHub show) and the site renders it at build time.
 *
 * No framework imports here (and explicit `.ts` extensions): the module also
 * runs under plain Node in `scripts/markdown.mts`, which writes the `.md`
 * and `llms.txt` files before `next build`.
 */

export type Section = {
  /** Route segment under /docs/. */
  slug: string;
  /** Short title for navigation. */
  nav: string;
  /** The README heading, as written. */
  title: string;
  /** GitHub-style anchor of the heading (what README links point to). */
  anchor: string;
  /** Markdown body (without the heading). */
  body: string;
  /** `###` headings inside, for the on-page outline. */
  subsections: { id: string; text: string }[];
};

/** Short route slugs and nav titles for the headings we know; anything new falls back to its GitHub anchor. */
const KNOWN: { match: RegExp; slug: string; nav: string }[] = [
  { match: /^why a frame/i, slug: "why", nav: "Why a frame and a worker" },
  { match: /^install/i, slug: "getting-started", nav: "Getting started" },
  { match: /^frame modes/i, slug: "frame-modes", nav: "Frame modes" },
  { match: /^functions/i, slug: "functions", nav: "Functions" },
  { match: /^running code/i, slug: "running-code", nav: "Running code" },
  { match: /^approval/i, slug: "approval", nav: "Approval" },
  { match: /^limits/i, slug: "limits", nav: "Limits and cancellation" },
  { match: /^integrations/i, slug: "integrations", nav: "Integrations" },
  { match: /^what crosses/i, slug: "boundary", nav: "What crosses the boundary" },
  { match: /^security model/i, slug: "security-model", nav: "Security model" },
  { match: /^browser support/i, slug: "browser-support", nav: "Browser support, size, versioning" },
  { match: /^api reference/i, slug: "api-reference", nav: "API reference" },
  { match: /^faq/i, slug: "faq", nav: "FAQ" },
];
const SKIP = [/^contents$/i, /^license$/i];

export function ghAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function readme(): string {
  // `next build` runs from site/; the README is the repository's.
  return readFileSync(join(process.cwd(), "..", "README.md"), "utf8");
}

let parsed: { intro: string; sections: Section[] } | null = null;

export function readmeSections(): { intro: string; sections: Section[] } {
  if (parsed) return parsed;
  const lines = readme().split("\n");
  const chunks: { title: string; body: string[] }[] = [];
  let intro: string[] = [];
  let current: { title: string; body: string[] } | null = null;
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    const h2 = !inFence && /^## (.+)$/.exec(line);
    if (h2) {
      current = { title: h2[1].trim(), body: [] };
      chunks.push(current);
      continue;
    }
    if (current) current.body.push(line);
    else intro.push(line);
  }
  // Drop the README's own H1; the site has its own.
  intro = intro.filter((l) => !/^# /.test(l));

  const sections: Section[] = chunks
    .filter((c) => !SKIP.some((re) => re.test(c.title)))
    .map((c) => {
      const known = KNOWN.find((k) => k.match.test(c.title.replace(/`/g, "")));
      const anchor = ghAnchor(c.title);
      const subsections: { id: string; text: string }[] = [];
      let fence = false;
      for (const l of c.body) {
        if (/^```/.test(l)) fence = !fence;
        const h3 = !fence && /^### (.+)$/.exec(l);
        if (h3) subsections.push({ id: ghAnchor(h3[1]), text: h3[1].replace(/`/g, "") });
      }
      return {
        slug: known?.slug ?? anchor,
        nav: known?.nav ?? c.title.replace(/`/g, ""),
        title: c.title.replace(/`/g, ""),
        anchor,
        body: c.body.join("\n").trim(),
        subsections,
      };
    });
  parsed = { intro: intro.join("\n").trim(), sections };
  return parsed;
}

export function sectionBySlug(slug: string): Section | undefined {
  return readmeSections().sections.find((s) => s.slug === slug);
}

/* ------------------------------------------------------------------ *
 * Markdown for people and models: one `.md` per page, an `llms.txt`
 * index and an `llms-full.txt` with everything. Same README text; the
 * in-README anchors become absolute links so each file stands alone.
 * ------------------------------------------------------------------ */

function absoluteLinks(md: string, sections: Section[]): string {
  return md.replace(/\]\(#([^)]+)\)/g, (m, anchor: string) => {
    const page = sections.find((s) => s.anchor === anchor);
    return page ? `](${SITE}/docs/${page.slug}.md)` : m;
  }).replace(/\]\(([A-Z]+\.md)\)/gi, (_m, file: string) => `](${LINKS.github}/blob/main/${file})`);
}

/** The first prose paragraph of a Markdown text, joined into one line. */
function firstParagraph(md: string): string {
  const out: string[] = [];
  let fence = false;
  for (const l of md.split("\n")) {
    if (/^```/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    const prose = l.trim() && !/^[#|>\[-]/.test(l);
    if (prose) out.push(l.trim());
    else if (out.length) break;
  }
  return out.join(" ");
}

/** Headings one level up (`###` → `##`), so a section stands under its own `#`. */
function liftHeadings(md: string): string {
  let fence = false;
  return md
    .split("\n")
    .map((l) => {
      if (/^```/.test(l)) fence = !fence;
      return !fence && /^#{3,} /.test(l) ? l.slice(1) : l;
    })
    .join("\n");
}

/** The page as a standalone Markdown document. */
export function sectionMarkdown(s: Section): string {
  const { sections } = readmeSections();
  return [
    `# ${s.title}`,
    "",
    `> ${PACKAGE} documentation · ${SITE}/docs/${s.slug}/ · source: README.md on GitHub (${LINKS.github})`,
    "",
    liftHeadings(absoluteLinks(s.body, sections)),
    "",
  ].join("\n");
}

/** llms.txt: what the library is and where each page's Markdown lives. */
export function llmsTxt(): string {
  const { intro, sections } = readmeSections();
  const summary = firstParagraph(intro);
  return [
    `# ${PACKAGE}`,
    "",
    `> ${summary.replace(/[`*_]/g, "")}`,
    "",
    `Site: ${SITE} · Source and README: ${LINKS.github} · npm: ${LINKS.npm}`,
    "",
    "## Docs",
    "",
    ...sections.map((s) => `- [${s.nav}](${SITE}/docs/${s.slug}.md)`),
    "",
    "## Optional",
    "",
    `- [Everything in one file](${SITE}/llms-full.txt)`,
    `- [Security policy](${LINKS.security})`,
    `- [Changelog](${LINKS.changelog})`,
    "",
  ].join("\n");
}

/** llms-full.txt: the README's intro and every section, in order. */
export function llmsFullTxt(): string {
  const { intro, sections } = readmeSections();
  return [
    `# ${PACKAGE}`,
    "",
    `> Full documentation in one file · ${SITE} · source: README.md (${LINKS.github})`,
    "",
    absoluteLinks(intro, sections),
    "",
    ...sections.map((s) => `## ${s.title}\n\n${absoluteLinks(s.body, sections)}\n`),
  ].join("\n");
}
