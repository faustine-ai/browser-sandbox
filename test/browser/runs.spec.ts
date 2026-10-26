import { expect, test } from '@playwright/test';
import { create, hits, openHost, ready, resume, run } from './helpers';

test.describe('runs', () => {
  test.beforeEach(async ({ page }) => ready(page));

  test('returns a value computed over function calls', async ({ page }) => {
    const r = await run(page, 's', 'const a = await sdk.math.add({ a: 2, b: 3 }); const b = await sdk.math.mul({ a, b: 4 }); return { a, b };');
    expect(r.status).toBe('ok');
    expect(r.value).toEqual({ a: 5, b: 20 });
    expect(r.calls.map((c) => c.fn)).toEqual(['math.add', 'math.mul']);
    expect(r.stats.opsUsed).toBe(2);
  });

  test('undefined becomes null, primitives pass, help is callable', async ({ page }) => {
    expect((await run(page, 's', 'await sdk.echo(1);')).value).toBeNull();
    expect((await run(page, 's', 'return await sdk.echo("x")')).value).toBe('x');
    expect((await run(page, 's', 'return await sdk.help()')).value).toBe('help text');
  });

  test('scope values are cloned in: a File round-trips', async ({ page }) => {
    const r = await run(page, 's', 'return files.a.name + ":" + (await files.a.text()) + ":" + files.a.type', { values: 'file' });
    expect(r.status).toBe('ok');
    expect(r.value).toBe('a.txt:hello file:text/plain');
  });

  test('a function may return a Blob', async ({ page }) => {
    const r = await run(page, 's', 'const b = await sdk.blob(); return [b.size, await b.text()]');
    expect(r.value).toEqual([5, 'hello']);
  });

  test('the root name is configurable', async ({ page }) => {
    const r = await run(page, 's', 'return await api.echo(7)', { root: 'api' });
    expect(r.value).toBe(7);
  });

  test('console output comes back as logs, capped', async ({ page }) => {
    const r = await run(page, 's', 'console.log("hi", { a: 1 }); console.warn("w"); for (let i = 0; i < 500; i++) console.info(i); return 1', { caps: { maxLogLines: 50 } });
    expect(r.status).toBe('ok');
    expect(r.logs[0]).toMatchObject({ level: 'log', text: 'hi {"a":1}' });
    expect(r.logs[1]).toMatchObject({ level: 'warn', text: 'w' });
    expect(r.logs.length).toBe(50);
    expect(r.stats.logsDropped).toBe(452);
  });

  test('a thrown error comes back with its name, message and line', async ({ page }) => {
    const r = await run(page, 's', 'const a = 1;\nthrow new TypeError("boom")');
    expect(r.status).toBe('error');
    expect(r.error).toMatchObject({ name: 'TypeError', message: 'boom' });
    if (r.error?.line !== undefined) expect(r.error.line).toBe(2);
  });

  test('a syntax error is an error, not a crash', async ({ page }) => {
    const r = await run(page, 's', 'return (');
    expect(r.status).toBe('error');
    expect(r.error?.name).toBe('SyntaxError');
  });

  test('a function that throws rejects the call; the code can catch it', async ({ page }) => {
    const r = await run(page, 's', 'try { await sdk.fail(); return "no" } catch (e) { return e.name + ":" + e.message }');
    expect(r.value).toBe('Error:nope');
    expect(r.calls[0]?.ok).toBe(false);
  });

  test('runs are isolated from each other', async ({ page }) => {
    await run(page, 's', 'globalThis.leak = 42; return 1');
    const r = await run(page, 's', 'return typeof globalThis.leak');
    expect(r.value).toBe('undefined');
  });

  test('runs queue on one sandbox', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const h = (window as unknown as { harness: { run: (n: string, c: string, o?: unknown) => Promise<{ value: unknown }> } }).harness;
      const [a, b] = await Promise.all([h.run('s', 'await sdk.slow(100); return "a"'), h.run('s', 'return "b"')]);
      return [a.value, b.value];
    });
    expect(r).toEqual(['a', 'b']);
  });

  test('srcdoc mode works on a host without CSP', async ({ page }) => {
    const c = await create(page, 'd', 'srcdoc');
    expect(c.state).toBe('ready');
    const r = await run(page, 'd', 'return await sdk.math.add({ a: 1, b: 1 })');
    expect(r.value).toBe(2);
  });

  test('a frame that does not exist is SandboxUnavailable, never a fallback', async ({ page }) => {
    const c = await create(page, 'x', '/nope-404', { bootTimeoutMs: 1500 });
    expect(c.state).toBe('failed');
    expect(c.error?.name).toBe('SandboxUnavailable');
    const r = await run(page, 'x', 'return 1');
    expect(r.status).toBe('error');
    expect(r.error?.name).toBe('SandboxUnavailable');
  });
});

test.describe('approval', () => {
  test.beforeEach(async ({ page }) => ready(page));

  test('deny: a marked function never runs', async ({ page }) => {
    const r = await run(page, 's', 'try { await sdk.del({ id: 1 }); return "ran" } catch (e) { return e.name }');
    expect(r.value).toBe('ApprovalRejected');
    expect((await hits(page)).del).toBe(0);
  });

  test('pause: approve runs it, reject throws into the code', async ({ page }) => {
    const ok = await run(page, 's', 'return await sdk.del({ id: 1 })', { approval: 'pause-approve' });
    expect(ok.value).toEqual({ ok: true, id: 1 });
    expect(ok.calls[0]?.decision).toBe('approved');
    const no = await run(page, 's', 'return await sdk.del({ id: 2 })', { approval: 'pause-reject' });
    expect(no.status).toBe('error');
    expect(no.error?.name).toBe('ApprovalRejected');
    expect((await hits(page)).del).toBe(1);
  });

  test('pause: the run clock stops while the human decides', async ({ page }) => {
    const r = await run(page, 's', 'return await sdk.del({ id: 3 })', { approval: 'pause-slow', caps: { timeoutMs: 800 } });
    expect(r.status).toBe('ok');
  });

  test('collect: deferred calls accumulate, one pending result, resume runs them', async ({ page }) => {
    const before = (await hits(page)).del;
    const r = await run(page, 's', 'for (const id of [1, 2, 3]) await sdk.del({ id }); return "done"', { approval: 'collect' });
    expect(r.status).toBe('pending');
    expect(r.pending?.map((p) => p.input)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect((await hits(page)).del).toBe(before);
    const done = await resume(page, { all: 'approve' });
    expect(done.status).toBe('ok');
    expect(done.value).toBe('done');
    expect((await hits(page)).del).toBe(before + 3);
    expect(done.calls.map((c) => c.decision)).toEqual(['approved', 'approved', 'approved']);
  });

  test('collect: observing a deferred result cuts the pass there', async ({ page }) => {
    const r = await run(page, 's', 'const a = await sdk.del({ id: 1 }); const x = a.ok; await sdk.del({ id: 2 }); return x', { approval: 'collect' });
    expect(r.status).toBe('pending');
    expect(r.pending?.length).toBe(1);
    const done = await resume(page, { all: 'approve' });
    // the second delete is reached only after the first ran: a second pause
    expect(done.status).toBe('pending');
    expect(done.pending?.map((p) => p.input)).toEqual([{ id: 2 }]);
    const final = await resume(page, { all: 'approve' });
    expect(final.status).toBe('ok');
    expect(final.value).toBe(true);
  });

  test('collect: partial decisions; a rejected one throws into the code on resume', async ({ page }) => {
    const r = await run(page, 's', 'const out = []; for (const id of [1, 2]) { try { await sdk.del({ id }); out.push("ok" + id) } catch (e) { out.push(e.name) } } return out', { approval: 'collect' });
    expect(r.status).toBe('pending');
    const [a, b] = r.pending!;
    const done = await resume(page, { approve: [a!.callId], reject: [b!.callId] });
    expect(done.status).toBe('ok');
    expect(done.value).toEqual(['ok1', 'ApprovalRejected']);
  });

  test('collect with the batch hook: the library owns the loop', async ({ page }) => {
    const r = await run(page, 's', 'await sdk.del({ id: 9 }); return "x"', { approval: 'collect-auto' });
    expect(r.status).toBe('ok');
    const no = await run(page, 's', 'await sdk.del({ id: 9 }); return "x"', { approval: 'collect-reject' });
    expect(no.status).toBe('error');
    expect(no.error?.name).toBe('ApprovalRejected');
  });

  test('replay refuses a call that differs from the approved one', async ({ page }) => {
    const r = await run(page, 's', 'await sdk.del({ id: Math.random() }); return 1', { approval: 'collect' });
    expect(r.status).toBe('pending');
    const done = await resume(page, { all: 'approve' });
    expect(done.status).toBe('error');
    expect(done.error?.name).toBe('ReplayMismatch');
    expect((await hits(page)).del).toBe(0);
  });

  test('replay reuses recorded reads instead of re-executing them', async ({ page }) => {
    const before = (await hits(page)).count;
    const r = await run(page, 's', 'const c = await sdk.count(); await sdk.del({ id: c }); return c', { approval: 'collect' });
    expect(r.status).toBe('pending');
    const done = await resume(page, { all: 'approve' });
    expect(done.status).toBe('ok');
    expect(done.value).toBe(before + 1);
    expect((await hits(page)).count).toBe(before + 1);
    expect(done.calls[0]?.decision).toBe('replayed');
  });
});

test.describe('limits and cancellation', () => {
  test.beforeEach(async ({ page }) => ready(page));

  test('a busy loop is terminated by the watchdog and the page stays alive', async ({ page }) => {
    const started = Date.now();
    const r = await run(page, 's', 'while (true) {}', { caps: { busyMs: 300 } });
    expect(r.status).toBe('limit');
    expect(r.limit).toBe('busy');
    expect(Date.now() - started).toBeLessThan(5000);
    expect(await page.evaluate(() => 1 + 1)).toBe(2);
  });

  test('a never-resolving wait hits the watchdog too', async ({ page }) => {
    const r = await run(page, 's', 'await new Promise(() => {})', { caps: { busyMs: 200 } });
    expect(r.limit).toBe('busy');
  });

  test('the run clock ends a run stuck in a slow function', async ({ page }) => {
    const r = await run(page, 's', 'await sdk.slow(5000); return 1', { caps: { timeoutMs: 300 } });
    expect(r.status).toBe('limit');
    expect(r.limit).toBe('timeout');
  });

  test('a signal aborts a run in flight', async ({ page }) => {
    const r = await run(page, 's', 'await sdk.slow(5000); return 1', { abortAfter: 100 });
    expect(r.status).toBe('aborted');
  });

  test('more calls than maxOps', async ({ page }) => {
    const r = await run(page, 's', 'for (let i = 0; i < 30; i++) await sdk.echo(i); return 1', { caps: { maxOps: 20 } });
    expect(r.limit).toBe('ops');
    expect(r.stats.opsUsed).toBe(21);
  });

  test('a value larger than maxOutputBytes never crosses', async ({ page }) => {
    const r = await run(page, 's', 'return "x".repeat(2000)', { caps: { maxOutputBytes: 1000 } });
    expect(r.limit).toBe('output');
    const c = await run(page, 's', 'return (await sdk.big(2000)).length', { caps: { maxOutputBytes: 1000 } });
    expect(c.limit).toBe('output');
  });

  test('an input larger than maxInputBytes', async ({ page }) => {
    const r = await run(page, 's', 'await sdk.echo("x".repeat(2000)); return 1', { caps: { maxInputBytes: 1000 } });
    expect(r.limit).toBe('input');
  });

  test('memory growth ends the run without taking the page', async ({ page }) => {
    const r = await run(page, 's', 'const a = []; while (true) a.push(new Array(1e6).fill(1))', { caps: { busyMs: 1000, timeoutMs: 20000 } });
    expect(r.status).toBe('limit');
    expect(['busy', 'crash', 'timeout']).toContain(r.limit);
    expect(await page.evaluate(() => 2 + 2)).toBe(4);
  });
});

test.describe('hosts with a CSP', () => {
  test('url mode boots on a strict host (nonce, no unsafe-eval, worker-src none)', async ({ page }) => {
    await openHost(page, 'strict');
    const c = await create(page, 's', '/sandbox');
    expect(c.state).toBe('ready');
    const r = await run(page, 's', 'return await sdk.math.add({ a: 20, b: 22 })');
    expect(r.value).toBe(42);
  });

  test('srcdoc mode fails clean on a strict host', async ({ page }) => {
    await openHost(page, 'strict');
    const c = await create(page, 'd', 'srcdoc', { bootTimeoutMs: 1500 });
    expect(c.state).toBe('failed');
    expect(c.error?.name).toBe('SandboxUnavailable');
  });

  test('both modes work on a lax host that allows blob: workers', async ({ page }) => {
    await openHost(page, 'lax');
    expect((await create(page, 'u', '/sandbox')).state).toBe('ready');
    expect((await create(page, 'd', 'srcdoc')).state).toBe('ready');
    expect((await run(page, 'u', 'return 1')).value).toBe(1);
    expect((await run(page, 'd', 'return 2')).value).toBe(2);
  });

  test('srcdoc inherits the host CSP: without worker-src blob: it fails clean, url mode still works', async ({ page }) => {
    await openHost(page, 'lax-noblob');
    expect((await create(page, 'u', '/sandbox')).state).toBe('ready');
    expect((await run(page, 'u', 'return 1')).value).toBe(1);
    expect((await create(page, 'd', 'srcdoc', { bootTimeoutMs: 1500 })).state).toBe('ready');
    const r = await run(page, 'd', 'return 2');
    expect(r.status).toBe('error');
    expect(r.error?.name).toBe('SandboxUnavailable');
  });
});
