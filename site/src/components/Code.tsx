import { highlight } from "@/lib/highlight";

/**
 * A highlighted code block, rendered at build time (server component).
 * `title` draws a window chrome with a file name; without it the block is bare.
 */
export async function Code({ code, lang = "ts", title, className = "" }: { code: string; lang?: string; title?: string; className?: string }) {
  const html = await highlight(code.trim(), lang);
  if (!title) return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <div className={`overflow-hidden rounded-2xl border border-ink-line bg-ink-2 shadow-iris ${className}`}>
      <div className="flex items-center gap-2 border-b border-ink-line px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
        <span className="ml-1 font-mono text-[0.7rem] text-white/45">{title}</span>
      </div>
      <div className="[&>pre.shiki]:rounded-none [&>pre.shiki]:border-0" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
