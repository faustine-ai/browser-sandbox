import { describe, expect, it } from 'vitest';
import { clientTools, fromTools, runCodeTool, type AiToolCall } from '../../src/ai';
import { asExecutor, toExecuteResult, type CodemodeResolvedProvider } from '../../src/codemode';
import type { Sandbox } from '../../src/core/sandbox';
import { executeRun, resolveRun } from '../../src/core/run';
import { DEFAULT_CAPS, type RunOptions, type RunResult } from '../../src/core/types';
import { asIsolateDriver, toExecutionResult } from '../../src/tanstack';
import { defineFunctions } from '../../src/functions/define';
import { deps } from './inprocess';

/** A Sandbox backed by the in-process pair, so adapters run real code. */
function fakeSandbox(): Sandbox & { runs: RunOptions[] } {
  const runs: RunOptions[] = [];
  return {
    runs,
    state: 'ready',
    ready: Promise.resolve(),
    dispose() {},
    run(options) {
      runs.push(options);
      return executeRun(deps(), resolveRun(options, `r${runs.length}`, { ...DEFAULT_CAPS, busyMs: 2000 }));
    },
  };
}

const base = { runId: 'r', logs: [{ level: 'log' as const, text: 'l', at: 1 }], calls: [], stats: { ms: 1, opsUsed: 0, logsDropped: 0 } };

describe('ai: runCodeTool', () => {
  it('runs the code from the input and maps the output', async () => {
    const sandbox = fakeSandbox();
    const seen: RunResult[] = [];
    const tool = runCodeTool({ sandbox, functions: defineFunctions({ echo: (x) => x }), onResult: (r) => seen.push(r) });
    expect(tool.name).toBe('runCode');
    expect(await tool.handle({ toolCallId: '1', toolName: 'runCode', input: { code: 'return await sdk.echo(5)' } })).toEqual({ ok: true, result: 5 });
    expect(seen[0]?.status).toBe('ok');
    expect(await tool.handle({ toolCallId: '2', toolName: 'runCode', input: { code: 1 } })).toEqual({ ok: false, error: 'code must be a string' });
    expect(await tool.handle({ toolCallId: '3', toolName: 'runCode', input: null })).toEqual({ ok: false, error: 'code must be a string' });
  });

  it('custom name, code key and output mapper', async () => {
    const tool = runCodeTool({ sandbox: fakeSandbox(), functions: defineFunctions({}), name: 'exec', codeKey: 'js', output: (r) => r.status });
    expect(tool.name).toBe('exec');
    expect(await tool.handle({ toolCallId: '1', toolName: 'exec', input: { js: 'return 1' } })).toBe('ok');
  });
});

describe('ai: clientTools', () => {
  const call = (toolName: string, input: unknown = {}): AiToolCall => ({ toolCallId: `id-${toolName}`, toolName, input });

  it('dispatches by name, leaves external alone, warns on unknown, delivers through attach', async () => {
    const outputs: unknown[] = [];
    const unknown: string[] = [];
    const tools = clientTools(
      {
        runCode: runCodeTool({ sandbox: fakeSandbox(), functions: defineFunctions({}) }),
        getLocation: async () => ({ city: 'X' }),
        boom: () => {
          throw new Error('bad');
        },
        confirmPayment: 'external',
      },
      { onUnknown: (c) => unknown.push(c.toolName) },
    );
    await tools.onToolCall({ toolCall: call('getLocation') });
    await tools.onToolCall({ toolCall: call('runCode', { code: 'return 2' }) });
    await tools.onToolCall({ toolCall: call('boom') });
    await tools.onToolCall({ toolCall: call('confirmPayment') });
    await tools.onToolCall({ toolCall: call('nope') });
    expect(outputs).toEqual([]);
    tools.attach({ addToolOutput: (o) => outputs.push(o) });
    expect(outputs).toEqual([
      { tool: 'getLocation', toolCallId: 'id-getLocation', output: { city: 'X' } },
      { tool: 'runCode', toolCallId: 'id-runCode', output: { ok: true, result: 2 } },
      { tool: 'boom', toolCallId: 'id-boom', state: 'output-error', errorText: 'bad' },
    ]);
    expect(unknown).toEqual(['nope']);
    await tools.onToolCall({ toolCall: call('getLocation') });
    expect(outputs.length).toBe(4);
    expect(await tools.handle(call('confirmPayment'))).toEqual({ handled: false });
  });

  it('warns on the console by default for an unknown tool', async () => {
    const warn = console.warn;
    const seen: unknown[] = [];
    console.warn = (...a: unknown[]) => seen.push(a);
    try {
      const r = await clientTools({}).handle(call('x'));
      expect(r).toEqual({ handled: false });
      expect(String(seen[0])).toContain('no client tool named "x"');
    } finally {
      console.warn = warn;
    }
  });
});

describe('ai: fromTools', () => {
  it('maps executable tools, namespaces, approval and schemas', async () => {
    const f = fromTools(
      {
        getLocation: { description: 'Where', inputSchema: { type: 'object' }, execute: async (input: unknown) => ({ input }) },
        serverOnly: { description: 'no execute' },
        danger: { needsApproval: true, inputSchema: { parse: () => 1 }, execute: () => 1 },
      },
      { namespace: 'app' },
    );
    expect(Object.keys(f)).toEqual(['app.getLocation', 'app.danger']);
    expect(f['app.getLocation']).toMatchObject({ description: 'Where', input: { type: 'object' } });
    expect(f['app.danger']).toMatchObject({ approval: true });
    expect(f['app.danger']!.input).toBeUndefined();
    expect(await f['app.getLocation']!.call({ a: 1 })).toEqual({ input: { a: 1 } });
    expect(Object.keys(fromTools({ x: { execute: () => 1 } }))).toEqual(['x']);
    expect(() => fromTools({ 'bad name': { execute: () => 1 } })).toThrow(/not usable/);
    const custom = fromTools({ x: { execute: () => 1 } }, { approval: () => true });
    expect(custom.x!.approval).toBe(true);
  });
});

describe('codemode: asExecutor', () => {
  it('a record of positional fns under codemode.*', async () => {
    const sandbox = fakeSandbox();
    const ex = asExecutor(sandbox);
    const r = await ex.execute('return await codemode.add(2, 3)', { add: async (a: unknown, b: unknown) => (a as number) + (b as number) });
    expect(r).toEqual({ result: 5, logs: [] });
    expect(sandbox.runs[0]?.scope?.root).toBe('codemode');
  });

  it('providers, approval, root override, error mapping', async () => {
    const sandbox = fakeSandbox();
    const ex = asExecutor(sandbox, { root: 'tools', needsApproval: (n) => n.endsWith('remove'), approval: { mode: 'collect' } });
    const providers: CodemodeResolvedProvider[] = [
      { name: 'books', fns: { list: async () => [1], remove: async (id: unknown) => id } },
      { name: 'obj', fns: { one: async (input: unknown) => input }, positionalArgs: false },
    ];
    expect(await ex.execute('return [await tools.books.list(), await tools.obj.one({ a: 1 })]', providers)).toEqual({ result: [[1], { a: 1 }], logs: [] });
    const paused = await ex.execute('await tools.books.remove(1); return 1', providers);
    expect(paused.error).toMatch(/paused: 1 operation/);
    expect(await ex.execute('throw new Error("x")', {})).toEqual({ result: undefined, error: 'Error: x', logs: [] });
  });

  it('toExecuteResult covers limit and aborted', () => {
    expect(toExecuteResult({ ...base, status: 'limit', limit: 'ops', error: { name: 'SandboxLimit', message: 'm' } })).toEqual({ result: undefined, error: 'sandbox_limit (ops): m', logs: ['l'] });
    expect(toExecuteResult({ ...base, status: 'aborted' })).toEqual({ result: undefined, error: 'aborted', logs: ['l'] });
  });
});

describe('tanstack: asIsolateDriver', () => {
  it('bindings become external_<name> bare functions', async () => {
    const sandbox = fakeSandbox();
    const driver = asIsolateDriver(sandbox);
    const ctx = await driver.createContext({
      bindings: {
        fetchWeather: (input: unknown) => ({ city: (input as { city: string }).city, temp: 20 }),
        'get-time': { execute: () => 'noon', description: 'time' },
        objFn: { fn: () => 'fn' },
        objCall: { call: () => 'call' },
        objHandler: { handler: () => 'handler' },
        broken: { description: 'nothing callable' },
        danger: { execute: () => 1, needsApproval: true },
      },
      timeout: 1234,
    });
    const r = await ctx.execute<unknown[]>('return [await external_fetchWeather({ city: "A" }), await external_get_time(), await external_objFn(), await external_objCall(), await external_objHandler(), typeof external_broken]');
    expect(r).toEqual({ success: true, value: [{ city: 'A', temp: 20 }, 'noon', 'fn', 'call', 'handler', 'undefined'], logs: [] });
    expect(sandbox.runs[0]?.caps?.timeoutMs).toBe(1234);
    expect(sandbox.runs[0]?.functions['external_danger']?.approval).toBe(true);
    const err = await ctx.execute('throw new RangeError("r")');
    expect(err).toEqual({ success: false, error: { name: 'RangeError', message: 'r' }, logs: [] });
    await ctx.dispose();
    expect((await ctx.execute('return 1')).error?.message).toBe('context disposed');
  });

  it('toExecutionResult covers every status', () => {
    expect(toExecutionResult({ ...base, status: 'limit', limit: 'busy', error: { name: 'SandboxLimit', message: 'm' } })).toEqual({ success: false, error: { name: 'SandboxLimit', message: 'busy: m' }, logs: ['l'] });
    expect(toExecutionResult({ ...base, status: 'aborted' })).toMatchObject({ success: false, error: { name: 'Aborted' } });
    expect(toExecutionResult({ ...base, status: 'pending', pending: [{ callId: 'c', seq: 1, fn: 'f', input: 1 }], resume: async () => ({ ...base, status: 'aborted' }) })).toMatchObject({ success: false, error: { name: 'ApprovalPending' } });
  });
});
