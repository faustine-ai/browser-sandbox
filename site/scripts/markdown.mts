// Writes the Markdown the site serves next to its pages: one `.md` per docs
// page, `llms.txt` and `llms-full.txt`. Runs before `next build` (prebuild);
// the files land in public/ and are not committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { llmsFullTxt, llmsTxt, readmeSections, sectionMarkdown } from "../src/lib/sections.ts";

const pub = join(process.cwd(), "public");
mkdirSync(join(pub, "docs"), { recursive: true });
const { sections } = readmeSections();
for (const s of sections) writeFileSync(join(pub, "docs", `${s.slug}.md`), sectionMarkdown(s));
writeFileSync(join(pub, "llms.txt"), llmsTxt());
writeFileSync(join(pub, "llms-full.txt"), llmsFullTxt());
console.log(`markdown: ${sections.length} pages, llms.txt, llms-full.txt`);
