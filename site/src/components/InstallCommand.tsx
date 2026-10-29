"use client";

import { useState } from "react";
import { INSTALL } from "@/lib/links";

/** The install line with a copy button. Light and dark variants. */
export function InstallCommand({ tone = "dark", className = "" }: { tone?: "dark" | "light"; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable: the text is selectable */
    }
  };
  const dark = tone === "dark";
  return (
    <div
      className={`inline-flex max-w-full items-center gap-2 rounded-full py-2 pl-4 pr-2 font-mono text-[0.78rem] ring-1 ring-inset sm:gap-3 sm:pl-5 sm:text-[0.86rem] ${
        dark ? "bg-white/[0.06] text-white/85 ring-white/15" : "bg-zinc-900/[0.04] text-zinc-800 ring-zinc-900/10"
      } ${className}`}
    >
      <span className={dark ? "text-iris-300" : "text-iris-600"} aria-hidden>
        $
      </span>
      <span className="min-w-0 select-all break-all text-left leading-snug">{INSTALL}</span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy install command"
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.72rem] font-sans font-medium transition-colors ${
          dark ? "bg-white/10 text-white hover:bg-white/20" : "bg-white text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
        }`}
      >
        {copied ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5 12 4.5 4.5L19 7" />
            </svg>
            Copied
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="8" y="8" width="12" height="12" rx="2" />
              <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
            </svg>
            Copy
          </>
        )}
      </button>
    </div>
  );
}
