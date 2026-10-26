// The worker side of the bridge, written without touching `self` so it can
// be unit-tested with a fake port. `entry.ts` wires it to the real worker.
import type { DoneMessage, ErrorShape, HostToWorker, LogLevel, RunMessage, WorkerToHost } from '../bridge/protocol';
import { makeConsole } from './console';
import { makePending, PENDING_OBSERVED } from './pending';
import { buildTree } from './tree';

export interface PortLike {
  postMessage(message: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export interface RuntimeHost {
  /** The global the code's `console` is installed on. */
  scope: Record<string, unknown>;
}

type DoneTail = { ok: true; value: unknown } | { ok: false; error: ErrorShape; pendingObserved?: boolean; tooLarge?: boolean };

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;

export function startRuntime(port: PortLike, host: RuntimeHost): void {
  let active: { runId: string; calls: Map<string, Pending>; aborted: boolean } | null = null;

  const send = (m: WorkerToHost) => port.postMessage(m);

  port.onmessage = (ev) => {
    const m = ev.data as HostToWorker;
    if (!m || typeof m !== 'object') return;
    if (m.t === 'run') {
      if (active) {
        send({ t: 'done', runId: m.runId, ok: false, error: { name: 'InvalidRun', message: 'A run is already active in this worker' }, opsUsed: 0, logsDropped: 0 });
        return;
      }
      const run = { runId: m.runId, calls: new Map<string, Pending>(), aborted: false };
      active = run;
      void execute(m, run).finally(() => {
        if (active === run) active = null;
      });
    } else if (m.t === 'result') {
      if (!active || active.runId !== m.runId) return;
      const p = active.calls.get(m.callId);
      if (!p) return;
      active.calls.delete(m.callId);
      if (m.ok === false) p.reject(toError(m.error));
      else if ('pending' in m) p.resolve(makePending(m.seq));
      else p.resolve(m.value);
    } else if (m.t === 'abort') {
      if (active && active.runId === m.runId) active.aborted = true;
    }
  };

  async function execute(m: RunMessage, run: { runId: string; calls: Map<string, Pending>; aborted: boolean }): Promise<void> {
    let seq = 0;
    const raw = (fn: string, input: unknown): Promise<unknown> =>
      new Promise((resolve, reject) => {
        const callId = `${m.runId}:${++seq}`;
        run.calls.set(callId, { resolve, reject });
        try {
          send({ t: 'call', runId: m.runId, callId, seq, fn, input });
        } catch (err) {
          run.calls.delete(callId);
          reject(cloneError(err));
        }
      });
    let call = raw;
    if (m.serialize) {
      // One call at a time, in creation order: a Promise.all still works, it
      // just queues, and a replay lands every call on the same seq.
      let queue: Promise<unknown> = Promise.resolve();
      call = (fn, input) => {
        const next = queue.then(() => raw(fn, input));
        queue = next.then(
          () => undefined,
          () => undefined,
        );
        return next;
      };
    }
    const captured = makeConsole((level: LogLevel, text: string) => send({ t: 'log', runId: m.runId, level, text }), m.caps);
    host.scope.console = captured.console;
    const finish = (d: DoneTail) => {
      if (run.aborted) return;
      const done = { t: 'done', runId: m.runId, opsUsed: seq, logsDropped: captured.dropped(), ...d } as DoneMessage;
      try {
        send(done);
      } catch (err) {
        send({ t: 'done', runId: m.runId, ok: false, error: cloneShape(err), opsUsed: seq, logsDropped: captured.dropped() });
      }
    };
    let fn: (...args: unknown[]) => Promise<unknown>;
    try {
      fn = new AsyncFunction(m.root, 'console', ...m.valueNames, m.code);
    } catch (err) {
      finish({ ok: false, error: shapeOf(err) });
      return;
    }
    try {
      const tree = buildTree(m.fnNames, call);
      const value = await fn(tree, captured.console, ...m.valueNames.map((n) => m.values[n]));
      const size = serialisedSize(value);
      if (size > m.caps.maxOutputBytes) {
        finish({ ok: false, error: { name: 'SandboxLimit', message: `result larger than ${m.caps.maxOutputBytes} bytes (${size})` }, tooLarge: true });
        return;
      }
      finish({ ok: true, value: value === undefined ? null : value });
    } catch (err) {
      const shape = shapeOf(err);
      finish({ ok: false, error: shape, pendingObserved: shape.name === PENDING_OBSERVED || undefined });
    }
  }
}

function toError(shape: ErrorShape): Error {
  const e = new Error(shape.message);
  e.name = shape.name;
  return e;
}

function cloneShape(err: unknown): ErrorShape {
  return { name: 'CloneError', message: err instanceof Error ? err.message : String(err) };
}

function cloneError(err: unknown): Error {
  const e = new Error(err instanceof Error ? err.message : String(err));
  e.name = 'CloneError';
  return e;
}

export function shapeOf(err: unknown): ErrorShape {
  if (!(err instanceof Error)) return { name: 'Error', message: String(err) };
  const shape: ErrorShape = { name: err.name || 'Error', message: err.message };
  const line = lineOf(err.stack);
  if (line !== undefined) shape.line = line;
  return shape;
}

/** Line inside the model's code: the AsyncFunction wrapper adds two lines before it. */
export function lineOf(stack: string | undefined): number | undefined {
  if (!stack) return undefined;
  const m = /(?:<anonymous>|Function|anonymous)[^\n]*?:(\d+):\d+/.exec(stack);
  if (!m) return undefined;
  const n = Number(m[1]) - 2;
  return n > 0 ? n : undefined;
}

function serialisedSize(value: unknown): number {
  if (value === undefined || value === null) return 4;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
  try {
    const s = JSON.stringify(value);
    return typeof s === 'string' ? s.length : 0;
  } catch {
    return 0;
  }
}
