import type { MetadataRoute } from "next";
import { SITE } from "@/lib/links";
import { readmeSections } from "@/lib/readme";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/docs`, changeFrequency: "weekly", priority: 0.9 },
    ...readmeSections().sections.map((s) => ({ url: `${SITE}/docs/${s.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    { url: `${SITE}/llms.txt`, changeFrequency: "weekly", priority: 0.5 },
  ];
}
