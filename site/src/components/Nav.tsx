"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Button, ArrowRight, Icons } from "./ui";
import { LINKS } from "@/lib/links";

const LINKS_NAV = [
  { label: "Docs", href: "/docs/" },
  { label: "API", href: "/docs/api-reference/" },
  { label: "Security", href: "/docs/security-model/" },
  { label: "FAQ", href: "/docs/faq/" },
  { label: "Try it", href: "/try/" },
];

/**
 * One level deep: the docs, the two pages people look for first, and the
 * repository. `solid` is for pages without a dark hero (the docs), where the
 * bar is light from the first pixel.
 */
export function Nav({ solid = false }: { solid?: boolean }) {
  const [scrolled, setScrolled] = useState(solid);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (solid) return;
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [solid]);

  const light = scrolled || solid;
  const linkColor = light ? "text-zinc-600 hover:text-zinc-900" : "text-white/75 hover:text-white";
  const iconColor = light
    ? "text-zinc-500 hover:bg-zinc-900/[0.05] hover:text-zinc-900"
    : "text-white/70 hover:bg-white/10 hover:text-white";

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={`transition-colors duration-300 ${
          light ? "border-b border-zinc-200/80 bg-white/85 backdrop-blur-xl" : "border-b border-transparent"
        }`}
      >
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-7">
          <a href="/" aria-label="browser-sandbox home">
            <Logo inverted={!light} wordmarkClass={light ? "text-zinc-900" : "text-white"} />
          </a>

          <div className="hidden items-center gap-1 lg:flex">
            {LINKS_NAV.map((l) => (
              <a key={l.href} href={l.href} className={`rounded-full px-3.5 py-2 text-[0.9rem] font-medium transition-colors ${linkColor}`}>
                {l.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-1.5 lg:flex">
            <a
              href={LINKS.github}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub repository"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${iconColor}`}
            >
              <Icons.Github />
            </a>
            <a
              href={LINKS.npm}
              target="_blank"
              rel="noreferrer"
              aria-label="npm package"
              className={`mr-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${iconColor}`}
            >
              <Icons.Npm />
            </a>
            <Button href="/docs/getting-started/" variant={light ? "primary" : "ghostDark"}>
              Get started <ArrowRight />
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className={`lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-full ${light ? "text-zinc-800" : "text-white"}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
            </svg>
          </button>
        </nav>
      </div>

      {open ? (
        <div className="lg:hidden border-b border-zinc-200 bg-white/95 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-5 py-4">
            {LINKS_NAV.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-3 text-[0.95rem] font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2 border-t border-zinc-100 pt-3">
              <a href={LINKS.github} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-[0.9rem] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                <Icons.Github /> GitHub
              </a>
              <a href={LINKS.npm} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-[0.9rem] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
                <Icons.Npm /> npm
              </a>
            </div>
            <div className="mt-3">
              <Button href="/docs/getting-started/" variant="primary" size="lg" className="w-full">
                Get started <ArrowRight />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
