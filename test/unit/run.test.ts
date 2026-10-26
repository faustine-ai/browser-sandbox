import { describe, expect, it } from 'vitest';
import { executeRun, resolveRun, type RunDeps } from '../../src/core/run';
import { DEFAULT_CAPS, type RunOptions, type RunResult } from '../../src/core/types';
import { defineFunctions } from '../../src/functions/define';
import { deps, makePair } from './inprocess';

const hits = { del: 0, count: 0 };
const functions = defineFunctions({
  echo: (x) => x,
  'math.add': (i) => (i as { a: number; b: number }).a + (i as { a: number; b: number }).b,
  slow: (ms) => new Promise((r) => setTimeout(() => r(ms), ms as number)),
  fail: () => {
    throw new Error('nope');
  },
  unclonable: () => () => 1,
  big: (n) => 'x'.repeat(n as number),
  count: () => ++hits.count,
  del: { call: (x) => ({ ok: true, id: (x as { id: number }).id, n: ++hits.del }), approval: true },
});

const caps = { ...DEFAULT_CAPS, timeoutMs: 5000, busyMs: 2000 };

function go(options: Partial<RunOptions> & { code: string }, d: RunDeps = deps()): Promise<RunResult> {
  return executeRun(d, resolveRun({ functions, ...options }, 'run1', caps));
}

describe('executeRun', () => {
  it('runs code over the function tree and returns the value', async () => {
    const r = await go({ code: 'const a = await sdk.math.add({ a: 1, b: 2 }); return a * 2' });
    expect(r.status).toBe('ok');
    expect(r).toMatchObject({ value: 6, stats: { opsUsed: 1 }, calls: [{ seq: 1, fn: 'math.add', ok: true }] });
  });

  it('exposes scope values by name and honours the root name', async () => {
    const r = await go({ code: 'return [await api.echo(x), y.k]', scope: { root: 'api', values: { x: 1, y: { k: 'v' } } } });
    expect(r).toMatchObject({ status: 'ok', value: [1, 'v'] });
  });

  it('captures logs, calls onLog and onCall', async () => {
    const seen: string[] = [];
    const calls: string[] = [];
    const r = await go({ code: 'console.log("a", 1); console.error(new Error("e")); await sdk.echo(2); return 1', onLog: (l) => seen.push(l.text), onCall: (c) => calls.push(c.fn) });
    expect(r.logs.map((l) => `${l.level}:${l.text}`)).toEqual(['log:a 1', 'error:Error: e']);
    expect(seen).toEqual(['a 1', 'Error: e']);
    expect(calls).toEqual(['echo']);
  });

  it('reports thrown errors with name, message and line', async () => {
    const r = await go({ code: 'const a = 1;\n\nthrow new RangeError("bad")' });
    expect(r).toMatchObject({ status: 'error', error: { name: 'RangeError', message: 'bad', line: 3 } });
  });

  it('reports syntax errors', async () => {
    const r = await go({ code: 'return (' });
    expect(r).toMatchObject({ status: 'error', error: { name: 'SyntaxError' } });
  });

  it('a failing function rejects the call', async () => {
    const r = await go({ code: 'try { await sdk.fail() } catch (e) { return e.name + ":" + e.message }' });
    expect(r).toMatchObject({ status: 'ok', value: 'Error:nope', calls: [{ ok: false, error: 'Error: nope' }] });
  });

  it('a BigInt result clones although it has no JSON form', async () => {
    expect(await go({ code: 'return 10n' })).toMatchObject({ status: 'ok', value: 10n });
  });

  it('undefined results become null', async () => {
    expect((await go({ code: 'await sdk.echo(1)' })) as { value: unknown }).toMatchObject({ value: null });
  });

  it('releases the worker as reusable after a clean run and not after a limit', async () => {
    const d = deps();
    await go({ code: 'return 1' }, d);
    expect(d.released).toEqual([{ reusable: true }]);
    const d2 = deps();
    await go({ code: 'await new Promise(() => {})', caps: { busyMs: 50 } }, d2);
    expect(d2.released).toEqual([{ reusable: false }]);
  });

  it('a failed spawn is a SandboxUnavailable error', async () => {
    const d: RunDeps = { spawn: async () => { throw Object.assign(new Error('no frame'), { name: 'SandboxUnavailable' }); }, release: () => {}, now: () => 0 };
    const r = await go({ code: 'return 1' }, d);
    expect(r).toMatchObject({ status: 'error', error: { name: 'SandboxUnavailable', message: 'no frame' } });
  });

  it('rejects invalid run options', () => {
    expect(() => resolveRun({ code: 'x', functions, scope: { root: '1x' } }, 'r', caps)).toThrow(/scope.root/);
    expect(() => resolveRun({ code: 'x', functions, scope: { values: { sdk: 1 } } }, 'r', caps)).toThrow(/scope.values/);
    expect(() => resolveRun({ code: 'x', functions, scope: { values: { 'a-b': 1 } } }, 'r', caps)).toThrow(/scope.values/);
    expect(() => resolveRun({ code: 1 as unknown as string, functions }, 'r', caps)).toThrow(/code/);
    expect(resolveRun({ code: 'x', functions, caps: { maxOps: undefined, busyMs: 7 } }, 'r', caps).caps).toMatchObject({ maxOps: 200, busyMs: 7 });
  });
});

describe('limits and cancellation', () => {
  it('busy watchdog', async () => {
    const r = await go({ code: 'await new Promise(r => setTimeout(r, 5000))', caps: { busyMs: 50 } });
    expect(r).toMatchObject({ status: 'limit', limit: 'busy' });
  });

  it('run timeout while a function is slow', async () => {
    const r = await go({ code: 'await sdk.slow(2000); return 1', caps: { timeoutMs: 80 } });
    expect(r).toMatchObject({ status: 'limit', limit: 'timeout' });
  });

  it('abort before and during', async () => {
    const c = new AbortController();
    c.abort();
    expect(await go({ code: 'return 1', signal: c.signal })).toMatchObject({ status: 'aborted' });
    const c2 = new AbortController();
    const p = go({ code: 'await sdk.slow(2000); return 1', signal: c2.signal });
    setTimeout(() => c2.abort(), 30);
    expect(await p).toMatchObject({ status: 'aborted' });
  });

  it('ops', async () => {
    const r = await go({ code: 'for (let i = 0; i < 10; i++) await sdk.echo(i); return 1', caps: { maxOps: 5 } });
    expect(r).toMatchObject({ status: 'limit', limit: 'ops', stats: { opsUsed: 6 } });
  });

  it('input and output sizes', async () => {
    expect(await go({ code: 'await sdk.echo("x".repeat(100)); return 1', caps: { maxInputBytes: 50 } })).toMatchObject({ status: 'limit', limit: 'input' });
    expect(await go({ code: 'return (await sdk.big(100)).length', caps: { maxOutputBytes: 50 } })).toMatchObject({ status: 'limit', limit: 'output' });
    expect(await go({ code: 'return "x".repeat(100)', caps: { maxOutputBytes: 50 } })).toMatchObject({ status: 'limit', limit: 'output' });
  });

  it('log caps truncate and count', async () => {
    const r = await go({ code: 'for (let i = 0; i < 20; i++) console.log("line" + i); console.log("x".repeat(500)); return 1', caps: { maxLogLines: 5, maxLogChars: 40 } });
    expect(r.logs.length).toBe(5);
    expect(r.stats.logsDropped).toBe(16);
  });

  it('a worker crash reported by the frame', async () => {
    const pair = makePair();
    const d = deps(pair);
    const p = go({ code: 'await sdk.slow(2000)' }, d);
    setTimeout(() => (pair as unknown as { crash: (m: string) => void }).crash('out of memory'), 20);
    expect(await p).toMatchObject({ status: 'limit', limit: 'crash' });
  });

  it('a worker error before it said anything is SandboxUnavailable', async () => {
    const pair = makePair();
    const d = deps(pair);
    const p = go({ code: 'await new Promise(r => setTimeout(r, 500))' }, d);
    setTimeout(() => (pair as unknown as { crash: (m: string) => void }).crash('blocked by CSP'), 20);
    expect(await p).toMatchObject({ status: 'error', error: { name: 'SandboxUnavailable', message: 'the worker could not start: blocked by CSP' } });
    expect(d.released).toEqual([{ reusable: false }]);
  });

  it('unclonable values are CloneErrors on either side', async () => {
    expect(await go({ code: 'return () => 1' })).toMatchObject({ status: 'error', error: { name: 'CloneError' } });
    expect(await go({ code: 'try { await sdk.unclonable() } catch (e) { return e.name }' })).toMatchObject({ value: 'CloneError' });
  });
});

describe('approval', () => {
  it('deny by default', async () => {
    const before = hits.del;
    const r = await go({ code: 'try { await sdk.del({ id: 1 }) } catch (e) { return e.name }' });
    expect(r).toMatchObject({ value: 'ApprovalRejected', calls: [{ decision: 'rejected' }] });
    expect(hits.del).toBe(before);
  });

  it('pause: approve, reject, a hook that throws, abort while waiting', async () => {
    const seen: unknown[] = [];
    const ok = await go({ code: 'return (await sdk.del({ id: 1 })).id', approval: { mode: 'pause', onApproval: async (c) => { seen.push(c); return 'approve'; } } });
    expect(ok).toMatchObject({ value: 1, calls: [{ decision: 'approved' }] });
    expect(seen[0]).toMatchObject({ runId: 'run1', seq: 1, fn: 'del', input: { id: 1 } });
    const no = await go({ code: 'return await sdk.del({ id: 2 })', approval: { mode: 'pause', onApproval: async () => 'reject' } });
    expect(no).toMatchObject({ status: 'error', error: { name: 'ApprovalRejected' } });
    const boom = await go({ code: 'return await sdk.del({ id: 3 })', approval: { mode: 'pause', onApproval: async () => { throw new Error('ui gone'); } } });
    expect(boom).toMatchObject({ status: 'error', error: { name: 'ApprovalRejected' } });
    expect(boom.logs[0]?.text).toMatch(/onApproval failed: ui gone/);
    const c = new AbortController();
    const p = go({ code: 'return await sdk.del({ id: 4 })', approval: { mode: 'pause', onApproval: () => new Promise((r) => setTimeout(() => r('approve'), 500)) }, signal: c.signal });
    setTimeout(() => c.abort(), 30);
    expect(await p).toMatchObject({ status: 'aborted' });
  });

  it('pause: the clock stops while waiting', async () => {
    const r = await go({ code: 'return (await sdk.del({ id: 5 })).ok', approval: { mode: 'pause', onApproval: () => new Promise((r) => setTimeout(() => r('approve'), 150)) }, caps: { timeoutMs: 100 } });
    expect(r).toMatchObject({ status: 'ok', value: true });
  });

  it('collect: defer, cut at the end, resume with replay', async () => {
    const before = hits.del;
    const r = await go({ code: 'const c = await sdk.count(); for (const id of [1, 2]) await sdk.del({ id }); return c', approval: { mode: 'collect' } });
    expect(r.status).toBe('pending');
    if (r.status !== 'pending') return;
    expect(r.pending.map((p) => p.input)).toEqual([{ id: 1 }, { id: 2 }]);
    expect(r.calls.map((c) => c.decision)).toEqual([undefined, 'deferred', 'deferred']);
    expect(hits.del).toBe(before);
    const count = hits.count;
    const done = await r.resume({ all: 'approve' });
    expect(done).toMatchObject({ status: 'ok', value: count });
    expect(hits.count).toBe(count);
    expect(hits.del).toBe(before + 2);
    expect(done.calls.map((c) => c.decision)).toEqual(['replayed', 'approved', 'approved']);
  });

  it('collect: observation cuts the pass; a later pause on resume', async () => {
    const r = await go({ code: 'const a = await sdk.del({ id: 1 }); if (a.ok) await sdk.del({ id: 2 }); return "end"', approval: { mode: 'collect' } });
    expect(r.status).toBe('pending');
    if (r.status !== 'pending') return;
    expect(r.pending.length).toBe(1);
    const again = await r.resume({ all: 'approve' });
    expect(again.status).toBe('pending');
    if (again.status !== 'pending') return;
    expect(again.pending.map((p) => p.input)).toEqual([{ id: 2 }]);
    expect(await again.resume({ all: 'approve' })).toMatchObject({ status: 'ok', value: 'end' });
  });

  it('collect: partial decisions and bad decisions', async () => {
    const r = await go({ code: 'const out = []; for (const id of [1, 2]) { try { await sdk.del({ id }); out.push(id) } catch (e) { out.push(e.name) } } return out', approval: { mode: 'collect' } });
    if (r.status !== 'pending') throw new Error(r.status);
    const [a, b] = r.pending;
    expect(() => r.resume({ approve: ['nope'] })).toThrow(/unknown callId/);
    expect(() => r.resume({ approve: [a!.callId] })).toThrow(/no decision/);
    expect(await r.resume({ approve: [a!.callId], reject: [b!.callId] })).toMatchObject({ status: 'ok', value: [1, 'ApprovalRejected'] });
  });

  it('collect: observing through every trap', async () => {
    for (const probe of ['a.x', 'Object.keys(a)', '({ ...a })', '"k" in a', 'a()', 'new a()', 'String(a)', 'JSON.stringify(a)', 'a.x = 1', 'delete a.x', 'Object.getPrototypeOf(a)']) {
      const r = await go({ code: `const a = await sdk.del({ id: 1 }); ${probe}; return 1`, approval: { mode: 'collect' } });
      expect(r.status, probe).toBe('pending');
    }
  });

  it('collect: the pending value is harmless until looked at', async () => {
    const r = await go({ code: 'const a = await sdk.del({ id: 1 }); const b = a; const c = [a]; return c.length', approval: { mode: 'collect' } });
    expect(r.status).toBe('pending');
  });

  it('replay mismatch', async () => {
    let n = 0;
    const fns = defineFunctions({ ...functions, rnd: () => ++n });
    const r = await executeRun(deps(), resolveRun({ code: 'await sdk.del({ id: Math.random() }); return 1', functions: fns, approval: { mode: 'collect' } }, 'r', caps));
    if (r.status !== 'pending') throw new Error(r.status);
    const done = await r.resume({ all: 'approve' });
    expect(done).toMatchObject({ status: 'error', error: { name: 'ReplayMismatch' } });
  });

  it('a PendingObserved with nothing pending is a plain error', async () => {
    const pair = makePair();
    const d = deps(pair);
    const p = go({ code: 'await sdk.slow(500)' }, d);
    await new Promise((r) => setTimeout(r, 20));
    pair.fromWorker({ t: 'done', runId: 'run1', ok: false, error: { name: 'PendingObserved', message: 'x' }, opsUsed: 1, logsDropped: 0 });
    expect(await p).toMatchObject({ status: 'error', error: { name: 'PendingObserved' } });
  });
});

describe('protocol edge cases on the host', () => {
  it('a call to a name outside the map answers UnknownFunction and runs nothing', async () => {
    const pair = makePair();
    const d = deps(pair);
    const p = go({ code: 'await sdk.slow(300); return 1' }, d);
    await new Promise((r) => setTimeout(r, 20));
    pair.fromWorker({ t: 'call', runId: 'run1', callId: 'run1:99', seq: 99, fn: 'evil', input: 1 });
    const r = await p;
    expect(r.calls.find((c) => c.fn === 'evil')).toMatchObject({ ok: false, error: 'UnknownFunction: "evil" is not a function the sandbox provides' });
  });

  it('messages for another run or after the end are ignored', async () => {
    const pair = makePair();
    const d = deps(pair);
    const p = go({ code: 'await sdk.slow(100); return 1' }, d);
    pair.fromWorker({ t: 'done', runId: 'other', ok: true, value: 9, opsUsed: 0, logsDropped: 0 });
    pair.fromWorker({ t: 'log', runId: 'other', level: 'log', text: 'x' });
    const r = await p;
    expect(r).toMatchObject({ status: 'ok', value: 1 });
    pair.fromWorker({ t: 'done', runId: 'run1', ok: true, value: 9, opsUsed: 0, logsDropped: 0 });
  });

  it('a second run on a busy worker is refused by the runtime', async () => {
    const pair = makePair();
    pair.link.onMessage(() => {});
    const seen: unknown[] = [];
    pair.link.onMessage((m) => seen.push(m));
    const run = { t: 'run' as const, runId: 'a', code: 'await new Promise(r => setTimeout(r, 100))', root: 'sdk', fnNames: [], valueNames: [], values: {}, caps: { maxOutputBytes: 1000, maxLogLines: 10, maxLogChars: 100 }, serialize: false };
    pair.link.post(run);
    pair.link.post({ ...run, runId: 'b' });
    await new Promise((r) => setTimeout(r, 200));
    expect(seen).toContainEqual(expect.objectContaining({ t: 'done', runId: 'b', ok: false, error: expect.objectContaining({ name: 'InvalidRun' }) }));
  });

  it('a done too large reported by the worker', async () => {
    const r = await go({ code: 'return "y".repeat(100)', caps: { maxOutputBytes: 10 } });
    expect(r).toMatchObject({ status: 'limit', limit: 'output' });
  });
});
