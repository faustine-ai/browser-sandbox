// Budgets from the plan: core ≤ 10 KB, worker runtime ≤ 4 KB, frame document ≤ 2 KB (min+gz).
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const gz = (s) => gzipSync(Buffer.from(s)).length;
const core = await build({ entryPoints: ['src/index.ts'], bundle: true, minify: true, write: false, format: 'esm', platform: 'browser' });
const coreGz = gz(core.outputFiles[0].text);
const embeds = readFileSync('src/generated/embeds.ts', 'utf-8');
const worker = JSON.parse(embeds.match(/WORKER_SOURCE = (".*?");\n/s)[1]);
const relay = JSON.parse(embeds.match(/RELAY_SOURCE = (".*?");\n/s)[1]);
const rows = [
  ['core (index, min+gz)', coreGz, 10 * 1024],
  ['worker runtime (min+gz)', gz(worker), 4 * 1024],
  ['frame relay (min+gz)', gz(relay), 2 * 1024],
];
let bad = false;
for (const [name, size, budget] of rows) {
  const ok = size <= budget;
  bad ||= !ok;
  console.log(`${ok ? 'ok ' : 'OVER'} ${name}: ${size} B (budget ${budget} B)`);
}
if (bad) process.exit(1);
