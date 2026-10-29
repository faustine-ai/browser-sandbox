import type { ReactNode } from "react";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { ArrowRight } from "./ui";
import { readmeSections, type Section } from "@/lib/readme";
import { LINKS } from "@/lib/links";

/**
 * Sidebar + prose. The sidebar lists the README's sections in order; the
 * active one unfolds its `###` headings. Prev / next close every page.
 */
export function DocsShell({ active, children }: { active?: Section; children: ReactNode }) {
  const { sections } = readmeSections();
  const idx = active ? sections.findIndex((s) => s.slug === active.slug) : -1;
  const prev = idx > 0 ? sections[idx - 1] : idx === 0 ? null : undefined;
  const next = idx >= 0 && idx < sections.length - 1 ? sections[idx + 1] : null;

  return (
    <>
      <Nav solid />
      <main className="flex-1 bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 pt-24 pb-20 sm:px-7 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
          <aside className="mb-10 lg:mb-0">
            <nav aria-label="Documentation" className="lg:sticky lg:top-24">
              <a
                href="/docs/"
                className={`block rounded-lg px-3 py-1.5 text-[0.9rem] font-medium transition-colors ${
                  !active ? "bg-iris-50 text-iris-800" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                Overview
              </a>
              <ul className="mt-1 space-y-0.5">
                {sections.map((s) => {
                  const on = active?.slug === s.slug;
                  return (
                    <li key={s.slug}>
                      <a
                        href={`/docs/${s.slug}/`}
                        aria-current={on ? "page" : undefined}
                        className={`block rounded-lg px-3 py-1.5 text-[0.9rem] transition-colors ${
                          on ? "bg-iris-50 font-medium text-iris-800" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                        }`}
                      >
                        {s.nav}
                      </a>
                      {on && s.subsections.length > 0 ? (
                        <ul className="mb-2 mt-1 ml-3 space-y-0.5 border-l border-zinc-200 pl-3">
                          {s.subsections.map((sub) => (
                            <li key={sub.id}>
                              <a href={`#${sub.id}`} className="block py-1 font-mono text-[0.76rem] text-zinc-500 hover:text-iris-700">
                                {sub.text}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-6 border-t border-zinc-100 pt-4">
                <a href={LINKS.github} target="_blank" rel="noreferrer" className="block px-3 py-1 text-[0.82rem] text-zinc-500 hover:text-zinc-900">
                  GitHub ↗
                </a>
                <a href={LINKS.npm} target="_blank" rel="noreferrer" className="block px-3 py-1 text-[0.82rem] text-zinc-500 hover:text-zinc-900">
                  npm ↗
                </a>
                <a href={`${LINKS.github}/blob/main/README.md`} target="_blank" rel="noreferrer" className="block px-3 py-1 text-[0.82rem] text-zinc-500 hover:text-zinc-900">
                  README.md ↗
                </a>
              </div>
            </nav>
          </aside>

          <article className="min-w-0">
            {children}
            {idx >= 0 ? (
              <div className="mt-16 flex flex-col gap-3 border-t border-zinc-200 pt-8 sm:flex-row sm:justify-between">
                {prev ? (
                  <a href={`/docs/${prev.slug}/`} className="group flex-1 rounded-2xl border border-zinc-200 p-4 transition-colors hover:border-iris-200 hover:bg-iris-50/40">
                    <span className="mono-label text-zinc-400">Previous</span>
                    <span className="mt-1 block text-[0.95rem] font-medium text-zinc-800">{prev.nav}</span>
                  </a>
                ) : prev === null ? (
                  <a href="/docs/" className="group flex-1 rounded-2xl border border-zinc-200 p-4 transition-colors hover:border-iris-200 hover:bg-iris-50/40">
                    <span className="mono-label text-zinc-400">Previous</span>
                    <span className="mt-1 block text-[0.95rem] font-medium text-zinc-800">Overview</span>
                  </a>
                ) : (
                  <span className="flex-1" />
                )}
                {next ? (
                  <a href={`/docs/${next.slug}/`} className="group flex-1 rounded-2xl border border-zinc-200 p-4 text-right transition-colors hover:border-iris-200 hover:bg-iris-50/40">
                    <span className="mono-label text-zinc-400">Next</span>
                    <span className="mt-1 flex items-center justify-end gap-1.5 text-[0.95rem] font-medium text-zinc-800">
                      {next.nav} <ArrowRight className="text-iris-600 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </a>
                ) : (
                  <span className="flex-1" />
                )}
              </div>
            ) : null}
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
