import { describe, expect, it } from 'vitest';
import { isWorkerToHost } from '../../src/bridge/protocol';
import { byteSize, canonicalJson } from '../../src/bridge/size';
import { SandboxError, errorShape } from '../../src/core/errors';
import { toToolOutput } from '../../src/core/output';
import type { RunResult } from '../../src/core/types';
import { FRAME_CSP, frameDocument, frameHeaders, frameVersion } from '../../src/frame/document';

describe('protocol', () => {
  it('isWorkerToHost', () => {
    expect(isWorkerToHost({ t: 'call', runId: 'r' })).toBe(true);
    expect(isWorkerToHost({ t: 'nope', runId: 'r' })).toBe(false);
    expect(isWorkerToHost({ t: 'done' })).toBe(false);
    expect(isWorkerToHost(null)).toBe(false);
    expect(isWorkerToHost('x')).toBe(false);
  });
});

describe('size', () => {
  it('byteSize', () => {
    expect(byteSize(undefined)).toBe(4);
    expect(byteSize('é')).toBe(4);
    expect(byteSize(new Blob(['abc']))).toBe(3);
    expect(byteSize(new ArrayBuffer(7))).toBe(7);
    expect(byteSize(new Uint8Array(5))).toBe(5);
    expect(byteSize(() => 1)).toBe(0);
    expect(byteSize(1n as unknown)).toBe(0);
  });
  it('canonicalJson is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 1, c: undefined }] })).toBe('{"a":[1,{"d":1}],"b":1}');
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson(new Blob(['ab']))).toBe('{"$blob":2}');
  });
});

describe('errors', () => {
  it('SandboxError keeps its name; errorShape handles non-errors', () => {
    const e = new SandboxError('SandboxLimit', 'm');
    expect(e.name).toBe('SandboxLimit');
    expect(errorShape(e)).toEqual({ name: 'SandboxLimit', message: 'm' });
    expect(errorShape('x')).toEqual({ name: 'Error', message: 'x' });
    const noName = new Error('n');
    noName.name = '';
    expect(errorShape(noName).name).toBe('Error');
  });
});

describe('toToolOutput', () => {
  const base = { runId: 'r', logs: [], calls: [], stats: { ms: 1, opsUsed: 0, logsDropped: 0 } };
  it('maps every status', () => {
    expect(toToolOutput({ ...base, status: 'ok', value: 1 })).toEqual({ ok: true, result: 1 });
    expect(toToolOutput({ ...base, status: 'ok', value: undefined })).toEqual({ ok: true, result: null });
    expect(toToolOutput({ ...base, status: 'error', error: { name: 'TypeError', message: 'x', line: 2 } })).toEqual({ ok: false, error: 'TypeError: x (line 2)' });
    expect(toToolOutput({ ...base, status: 'error', error: { name: 'Error', message: 'x' } })).toEqual({ ok: false, error: 'x' });
    expect(toToolOutput({ ...base, status: 'limit', limit: 'ops', error: { name: 'SandboxLimit', message: 'too many' } })).toEqual({ ok: false, error: 'Denied (sandbox_limit): too many' });
    expect(toToolOutput({ ...base, status: 'aborted' })).toEqual({ ok: false, error: 'The run was cancelled.' });
    const pending: RunResult = { ...base, status: 'pending', pending: [{ callId: 'c', seq: 1, fn: 'del', input: { id: 1 } }], resume: async () => ({ ...base, status: 'aborted' }) };
    const out = toToolOutput(pending);
    expect(out.ok).toBe(false);
    expect((out as { error: string }).error).toContain('Paused: 1 operation in this code');
    expect((out as { error: string }).error).toContain('- del {"id":1}');
    const two: RunResult = { ...pending, pending: [...pending.pending, { callId: 'd', seq: 2, fn: 'x', input: { s: 'y'.repeat(500) } }] };
    expect((toToolOutput(two) as { error: string }).error).toContain('2 operations');
    expect((toToolOutput(two) as { error: string }).error).toContain('…');
    const cyc: Record<string, unknown> = {};
    cyc.c = cyc;
    expect((toToolOutput({ ...pending, pending: [{ callId: 'c', seq: 1, fn: 'f', input: cyc }] }) as { error: string }).error).toContain('[object Object]');
  });
  it('carries logs', () => {
    expect(toToolOutput({ ...base, logs: [{ level: 'log', text: 'hi', at: 1 }], status: 'ok', value: 1 })).toEqual({ ok: true, result: 1, logs: ['[log] hi'] });
  });
});

describe('frame document', () => {
  it('has the CSP meta, the hashed relay and matching headers', () => {
    const doc = frameDocument();
    expect(doc).toContain(`<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">`);
    expect(doc).toContain('<script>');
    expect(FRAME_CSP).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+' 'unsafe-eval'/);
    expect(FRAME_CSP).toContain("connect-src 'none'");
    const h = frameHeaders();
    expect(h['Content-Security-Policy']).toBe(`${FRAME_CSP}; frame-ancestors *`);
    expect(h['Cache-Control']).toContain('immutable');
    expect(frameVersion()).toMatch(/^[A-Za-z0-9]{12}$/);
  });
});
