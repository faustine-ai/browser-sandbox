// Numbers for the I0 record: boot in both modes, bridge overhead per call,
// clone cost of a large payload. Printed, not asserted (except sanity caps).
import { expect, test } from '@playwright/test';
import { create, openHost } from './helpers';

test('timings', async ({ page }, info) => {
  await openHost(page, 'none');
  const t = await page.evaluate(async () => {
    const h = (window as unknown as { harness: { lib: typeof import('../../src/index'); create: (n: string, f: string, o?: unknown) => Promise<unknown>; sandboxes: Record<string, import('../../src/index').Sandbox> } }).harness;
    const now = () => performance.now();
    const out: Record<string, number> = {};
    let t0 = now();
    await h.create('u1', '/sandbox');
    out.bootUrlColdMs = now() - t0;
    t0 = now();
    await h.create('u2', '/sandbox');
    out.bootUrlWarmMs = now() - t0;
    t0 = now();
    await h.create('d1', 'srcdoc');
    out.bootSrcdocMs = now() - t0;
    const functions = h.lib.defineFunctions({ echo: (x: unknown) => x });
    const s = h.sandboxes.u1!;
    t0 = now();
    await s.run({ code: 'return 1', functions });
    out.firstRunMs = now() - t0;
    t0 = now();
    const r = await s.run({ code: 'for (let i = 0; i < 200; i++) await sdk.echo(i); return 1', functions });
    out.perCallMs = (now() - t0) / 200;
    if (r.status !== 'ok') throw new Error(r.status);
    const big = 'x'.repeat(1_000_000);
    t0 = now();
    const b = await s.run({ code: 'return (await sdk.echo(big)).length', functions, scope: { values: { big } }, caps: { maxOutputBytes: 5_000_000, maxInputBytes: 5_000_000 } });
    out.oneMbRoundTripMs = now() - t0;
    if (b.status !== 'ok') throw new Error(b.status);
    const file = new File([new Uint8Array(5_000_000)], 'f.bin');
    t0 = now();
    const f = await s.run({ code: 'return files.f.size', functions, scope: { values: { files: { f: file } } } });
    out.fiveMbFileMs = now() - t0;
    if (f.status !== 'ok') throw new Error(f.status);
    return out;
  });
  for (const [k, v] of Object.entries(t)) info.annotations.push({ type: k, description: v.toFixed(2) });
  console.log(`[${info.project.name}] ${Object.entries(t).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' ')}`);
  expect(t.perCallMs).toBeLessThan(5);
  expect(t.bootUrlWarmMs).toBeLessThan(2000);
});
