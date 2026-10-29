import { Container } from "./ui";
import { Logo } from "./Logo";
import { LINKS } from "@/lib/links";

type Link = { label: string; href: string; external?: boolean };

const COLUMNS: { title: string; links: Link[] }[] = [
  {
    title: "Library",
    links: [
      { label: "Getting started", href: "/docs/getting-started/" },
      { label: "Approval", href: "/docs/approval/" },
      { label: "Security model", href: "/docs/security-model/" },
      { label: "API reference", href: "/docs/api-reference/" },
      { label: "FAQ", href: "/docs/faq/" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub", href: LINKS.github, external: true },
      { label: "npm", href: LINKS.npm, external: true },
      { label: "Changelog", href: LINKS.changelog, external: true },
      { label: "Report a vulnerability", href: LINKS.security, external: true },
    ],
  },
  {
    title: "Faustine",
    links: [
      { label: "faustine.ai", href: LINKS.faustine, external: true },
      { label: "Web App Agents", href: LINKS.webAgents, external: true },
      { label: "Contact", href: "mailto:lean@faustine.ai" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-ink text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-iris/50 to-transparent" aria-hidden />
      <Container className="py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2.6fr]">
          <div>
            <Logo inverted />
            <p className="mt-4 max-w-xs text-[0.92rem] leading-relaxed text-white/55">
              Run model-written JavaScript in the browser, in a Worker inside an opaque-origin frame. No network, no DOM,
              only the functions you hand it.
            </p>
            <p className="mt-4 font-mono text-[0.72rem] text-white/40">MIT · built by Faustine for its Web Agents</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h3 className="mono-label text-white/40">{col.title}</h3>
                <ul className="mt-4 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}
                        className="text-[0.9rem] text-white/60 transition-colors hover:text-white"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/[0.08] pt-7 sm:flex-row sm:items-center">
          <p className="font-mono text-[0.72rem] text-white/40">© 2026 Faustine · @faustine-ai/browser-sandbox</p>
          <p className="font-mono text-[0.72rem] text-white/40">
            The README is the documentation. This site is built from it.{" "}
            <a href="/llms.txt" className="text-white/60 transition-colors hover:text-white">
              llms.txt
            </a>
          </p>
        </div>
      </Container>
    </footer>
  );
}
