import type { Metadata } from "next";
import { DocsShell } from "@/components/DocsShell";
import { Eyebrow, ArrowRight } from "@/components/ui";
import { readmeSections, renderMarkdown } from "@/lib/readme";

export const metadata: Metadata = {
  title: "Documentation",
  description: "The documentation of @faustine-ai/browser-sandbox, built from its README: why a frame and a worker, getting started, functions, approval, limits, integrations, the security model and the API reference.",
  alternates: { canonical: "/docs" },
};

/** The README's opening (what the package is, the drawing, the five claims) plus the table of contents as cards. */
export default async function DocsIndex() {
  const { intro, sections } = readmeSections();
  const html = await renderMarkdown(intro);
  return (
    <DocsShell>
      <Eyebrow>Docs · Overview</Eyebrow>
      <h1 className="mt-4 text-[2rem] font-semibold leading-[1.1] tracking-[-0.032em] text-zinc-900 sm:text-[2.4rem]">
        @faustine-ai/browser-sandbox
      </h1>
      <div className="prose mt-8" dangerouslySetInnerHTML={{ __html: html }} />

      <h2 className="mt-14 text-[1.4rem] font-semibold tracking-[-0.025em] text-zinc-900">Contents</h2>
      <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map((s, i) => (
          <li key={s.slug}>
            <a
              href={`/docs/${s.slug}/`}
              className="group flex h-full items-start gap-3.5 rounded-2xl border border-zinc-200/80 p-4 transition-all hover:-translate-y-0.5 hover:border-iris-200 hover:shadow-card"
            >
              <span className="mt-0.5 font-mono text-[0.72rem] text-zinc-400">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[0.95rem] font-medium text-zinc-900">
                  {s.nav}
                  <ArrowRight className="text-iris-600 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                </span>
                {s.subsections.length > 0 ? (
                  <span className="mt-1 block truncate font-mono text-[0.72rem] text-zinc-500">{s.subsections.map((x) => x.text).join(" · ")}</span>
                ) : null}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </DocsShell>
  );
}
