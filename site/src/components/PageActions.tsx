"use client";

import { useState } from "react";

/**
 * The row under a docs title for whoever reads with a model: copy the page
 * as Markdown, open the raw `.md`, or hand the page to Claude or ChatGPT.
 */
export function PageActions({ markdown, mdUrl }: { markdown: string; mdUrl: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.open(mdUrl, "_blank", "noreferrer");
    }
  };
  const ask = encodeURIComponent(`Read ${mdUrl} and help me use it. Answer from that page.`);
  const link = "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.76rem] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200 transition-colors hover:bg-zinc-50 hover:text-zinc-900";
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Page as Markdown">
      <button type="button" onClick={copy} className={link}>
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
            Copy as Markdown
          </>
        )}
      </button>
      <a href={mdUrl} className={link} target="_blank" rel="noreferrer">
        View as Markdown
      </a>
      <a href={`https://claude.ai/new?q=${ask}`} className={link} target="_blank" rel="noreferrer">
        Open in Claude
      </a>
      <a href={`https://chatgpt.com/?hints=search&q=${ask}`} className={link} target="_blank" rel="noreferrer">
        Open in ChatGPT
      </a>
    </div>
  );
}
