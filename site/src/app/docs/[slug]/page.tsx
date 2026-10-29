import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsShell } from "@/components/DocsShell";
import { Eyebrow } from "@/components/ui";
import { PageActions } from "@/components/PageActions";
import { SITE } from "@/lib/links";
import { readmeSections, renderMarkdown, sectionBySlug, sectionMarkdown } from "@/lib/readme";

export const dynamicParams = false;

export function generateStaticParams() {
  return readmeSections().sections.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = sectionBySlug(slug);
  if (!s) return {};
  const firstLine = s.body.split("\n").find((l) => l.trim() && !l.startsWith("```") && !l.startsWith("#") && !l.startsWith("|")) ?? "";
  return {
    title: s.nav,
    description: firstLine.replace(/[`*_\[\]]/g, "").slice(0, 200),
    alternates: { canonical: `/docs/${s.slug}` },
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = sectionBySlug(slug);
  if (!s) notFound();
  const html = await renderMarkdown(s.body);
  const { sections } = readmeSections();
  const n = sections.findIndex((x) => x.slug === s.slug) + 1;
  return (
    <DocsShell active={s}>
      <Eyebrow>
        Docs · {String(n).padStart(2, "0")} / {String(sections.length).padStart(2, "0")}
      </Eyebrow>
      <h1 className="mt-4 text-[2rem] font-semibold leading-[1.1] tracking-[-0.032em] text-zinc-900 sm:text-[2.4rem]">{s.title}</h1>
      <div className="mt-5">
        <PageActions markdown={sectionMarkdown(s)} mdUrl={`${SITE}/docs/${s.slug}.md`} />
      </div>
      <div className="prose mt-8" dangerouslySetInnerHTML={{ __html: html }} />
    </DocsShell>
  );
}
