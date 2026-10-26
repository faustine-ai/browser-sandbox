import { describe, expect, it } from 'vitest';
import { formatArg, makeConsole } from '../../src/worker/console';
import { makePending, pendingSeq, PENDING_OBSERVED } from '../../src/worker/pending';
import { lineOf, shapeOf, startRuntime } from '../../src/worker/runtime';
import { harden, REMOVED_GLOBALS } from '../../src/worker/scope';
import { buildTree } from '../../src/worker/tree';

describe('harden', () => {
  it('removes own and inherited names, shadows what it cannot delete', () => {
    const proto = Object.create(null) as Record<string, unknown>;
    proto.fetch = () => 1;
    const scope = Object.create(proto) as Record<string, unknown>;
    scope.WebSocket = class {};
    Object.defineProperty(scope, 'navigator', { value: {}, configurable: false, writable: true });
    const left = harden(scope, ['fetch', 'WebSocket', 'navigator', 'absent']);
    expect(left).toEqual([]);
    expect('fetch' in scope).toBe(false);
    expect('WebSocket' in scope).toBe(false);
    expect(scope.navigator).toBeUndefined();
    expect(REMOVED_GLOBALS).toContain('importScripts');
  });

  it('reports a name it could neither delete nor shadow', () => {
    const scope = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(scope, 'stuck', { value: 1, configurable: false, writable: false });
    expect(harden(scope, ['stuck'])).toEqual(['stuck']);
  });
});

describe('pending', () => {
  it('throws on any observation except then and toStringTag', () => {
    const p = makePending(3) as Record<string, unknown> & (() => void);
    expect(pendingSeq(p)).toBe(3);
    expect(pendingSeq({})).toBeNull();
    expect(pendingSeq(null)).toBeNull();
    expect(p.then).toBeUndefined();
    expect((p as unknown as Record<symbol, unknown>)[Symbol.toStringTag]).toBeUndefined();
    const throws = (f: () => unknown) => expect(f).toThrow(expect.objectContaining({ name: PENDING_OBSERVED }));
    throws(() => p.x);
    throws(() => Object.keys(p));
    throws(() => ({ ...p }));
    throws(() => 'x' in p);
    throws(() => p());
    throws(() => new (p as unknown as new () => unknown)());
    throws(() => String(p));
    throws(() => JSON.stringify(p));
    throws(() => {
      p.x = 1;
    });
    throws(() => delete p.x);
    throws(() => Object.getPrototypeOf(p));
    throws(() => Object.setPrototypeOf(p, null));
    throws(() => Object.getOwnPropertyDescriptor(p, 'x'));
    throws(() => Object.defineProperty(p, 'x', { value: 1 }));
  });

  it('pendingSeq swallows a throwing object', () => {
    const evil = new Proxy({}, { get: () => { throw new Error('x'); } });
    expect(pendingSeq(evil)).toBeNull();
  });
});

describe('console', () => {
  it('formats, caps lines and chars, counts the rest', () => {
    const out: string[] = [];
    const c = makeConsole((level, text) => out.push(`${level}:${text}`), { maxLogLines: 3, maxLogChars: 60 });
    c.console.log!('a', 1, { b: 2 }, [3], null, undefined, true);
    c.console.info!('x'.repeat(100));
    c.console.warn!('after cap');
    c.console.error!('dropped');
    c.console.assert!(false, 'oops');
    c.console.group!();
    c.console.table!({});
    expect(out).toEqual(['log:a 1 {"b":2} [3] null undefined true', `info:${'x'.repeat(24)}…`]);
    expect(c.dropped()).toBe(4);
  });

  it('formatArg handles odd values', () => {
    expect(formatArg(new Error('e'))).toBe('Error: e');
    expect(formatArg(() => 1)).toBe('[function anonymous]');
    expect(formatArg(Symbol('s'))).toBe('Symbol(s)');
    expect(formatArg(10n)).toBe('10');
    expect(formatArg({ n: 1n })).toBe('{"n":"1"}');
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(formatArg(cyc)).toBe('[object Object]');
    expect(formatArg(undefined)).toBe('undefined');
  });
});

describe('tree', () => {
  it('builds nested frozen objects whose leaves call by full name', async () => {
    const calls: string[] = [];
    const t = buildTree(['a.b.c', 'a.d', 'e', 'e.f'], async (fn, input) => {
      calls.push(`${fn}:${String(input)}`);
      return fn;
    });
    const a = t.a as { b: { c: (i: unknown) => Promise<unknown> }; d: (i: unknown) => Promise<unknown> };
    expect(await a.b.c(1)).toBe('a.b.c');
    expect(await a.d(2)).toBe('a.d');
    const e = t.e as ((i: unknown) => Promise<unknown>) & { f: (i: unknown) => Promise<unknown> };
    expect(await e(3)).toBe('e');
    expect(await e.f(4)).toBe('e.f');
    expect(calls).toEqual(['a.b.c:1', 'a.d:2', 'e:3', 'e.f:4']);
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(a.b)).toBe(true);
    expect((t as { constructor?: unknown }).constructor).toBeUndefined();
    expect((e.f as { name: string }).name).toBe('f');
    const pos = buildTree(['p'], async (_fn, input) => input, new Set(['p']));
    expect(await (pos.p as (...a: unknown[]) => Promise<unknown>)(1, 2)).toEqual([1, 2]);
  });
});

describe('runtime helpers', () => {
  it('lineOf parses V8 and SpiderMonkey shaped stacks', () => {
    expect(lineOf('Error: x\n    at eval (eval at <anonymous>, <anonymous>:5:7)')).toBe(3);
    expect(lineOf('x@http://a/b:1:1\nanonymous@Function:4:3')).toBe(2);
    expect(lineOf('Error: x\n    at <anonymous>:1:1')).toBeUndefined();
    expect(lineOf(undefined)).toBeUndefined();
    expect(lineOf('nothing here')).toBeUndefined();
  });

  it('shapeOf handles non-errors', () => {
    expect(shapeOf('str')).toEqual({ name: 'Error', message: 'str' });
    const e = new Error('m');
    e.name = '';
    expect(shapeOf(e).name).toBe('Error');
  });

  it('ignores malformed and stray messages', async () => {
    const sent: unknown[] = [];
    const port = { onmessage: null as ((ev: { data: unknown }) => void) | null, postMessage: (m: unknown) => sent.push(m) };
    startRuntime(port, { scope: {} });
    port.onmessage!({ data: null });
    port.onmessage!({ data: { t: 'result', runId: 'none', callId: 'x', ok: true, value: 1 } });
    port.onmessage!({ data: { t: 'abort', runId: 'none' } });
    port.onmessage!({ data: { t: 'run', runId: 'r', code: 'return 1', root: 'sdk', fnNames: [], positional: [], spread: false, valueNames: [], values: {}, caps: { maxOutputBytes: 10, maxLogLines: 1, maxLogChars: 10 }, serialize: false } });
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toEqual([{ t: 'done', runId: 'r', ok: true, value: 1, opsUsed: 0, logsDropped: 0 }]);
    port.onmessage!({ data: { t: 'result', runId: 'r', callId: 'r:9', ok: true, value: 1 } });
  });

  it('an aborted run sends no done', async () => {
    const sent: unknown[] = [];
    const port = { onmessage: null as ((ev: { data: unknown }) => void) | null, postMessage: (m: unknown) => sent.push(m) };
    startRuntime(port, { scope: {} });
    port.onmessage!({ data: { t: 'run', runId: 'r', code: 'await new Promise(r => setTimeout(r, 20)); return 1', root: 'sdk', fnNames: [], positional: [], spread: false, valueNames: [], values: {}, caps: { maxOutputBytes: 10, maxLogLines: 1, maxLogChars: 10 }, serialize: false } });
    port.onmessage!({ data: { t: 'abort', runId: 'r' } });
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual([]);
  });

  it('a done that cannot be cloned becomes a CloneError done; a call post that throws rejects the call', async () => {
    const sent: unknown[] = [];
    let failNext = false;
    const port = {
      onmessage: null as ((ev: { data: unknown }) => void) | null,
      postMessage: (m: unknown) => {
        if (failNext) {
          failNext = false;
          throw new Error('DataCloneError');
        }
        sent.push(structuredClone(m));
      },
    };
    startRuntime(port, { scope: {} });
    port.onmessage!({ data: { t: 'run', runId: 'r', code: 'return () => 1', root: 'sdk', fnNames: [], positional: [], spread: false, valueNames: [], values: {}, caps: { maxOutputBytes: 10, maxLogLines: 1, maxLogChars: 10 }, serialize: false } });
    await new Promise((r) => setTimeout(r, 10));
    expect(sent[0]).toMatchObject({ t: 'done', ok: false, error: { name: 'CloneError' } });
    sent.length = 0;
    failNext = true;
    port.onmessage!({ data: { t: 'run', runId: 'r2', code: 'try { await sdk.f(1) } catch (e) { return e.name }', root: 'sdk', fnNames: ['f'], positional: [], spread: false, valueNames: [], values: {}, caps: { maxOutputBytes: 100, maxLogLines: 1, maxLogChars: 10 }, serialize: false } });
    await new Promise((r) => setTimeout(r, 10));
    expect(sent[0]).toMatchObject({ t: 'done', ok: true, value: 'CloneError' });
  });
});
