// ESM + CJS for every entry point; types from tsc --declaration.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

import { existsSync } from 'node:fs';
const entries = ['index', 'ai', 'codemode', 'tanstack', 'frame'].filter((n) => existsSync(`src/${n}.ts`));
for (const name of entries) {
  for (const format of ['esm', 'cjs']) {
    await build({
      entryPoints: [`src/${name}.ts`],
      bundle: true,
      platform: 'neutral',
      target: 'es2022',
      format,
      outfile: `dist/${name}.${format === 'esm' ? 'js' : 'cjs'}`,
      external: ['ai', '@cloudflare/codemode', '@tanstack/ai'],
      mainFields: ['module', 'main'],
    });
  }
}
execSync('tsc -p tsconfig.build.json', { stdio: 'inherit' });
