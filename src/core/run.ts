// The host side of a run: caps, clocks, approval, replay. Written against a
// `WorkerLink` so it runs under a fake worker in unit tests and the real one
// in the browser.
import type { HostToWorker, WorkerToHost } from '../bridge/protocol';
import { byteSize, canonicalJson } from '../bridge/size';
import type { FunctionMap } from '../functions/define';
import { SandboxError, errorShape } from './errors';
import type { ApprovalOptions, CallRecord, Caps, Decisions, LimitKind, LogLine, PendingCall, RunOptions, RunResult } from './types';

export interface WorkerLink {
  post(msg: HostToWorker): void;
  onMessage(cb: (msg: WorkerToHost) => void): void;
  onError(cb: (message: string) => void): void;
  kill(): void;
}

export interface RunDeps {
  spawn(): Promise<WorkerLink>;
  /** Called once per run with the link; `reusable` is false when the run ended abnormally. */
  release(link: WorkerLink, reusable: boolean): void;
  now(): number;
}

export interface ResolvedRun {
  runId: string;
  code: string;
  functions: FunctionMap;
  root: string;
  values: Record<string, unknown>;
  spread: boolean;
  approval: ApprovalOptions;
  caps: Caps;
  signal?: AbortSignal;
  onLog?: RunOptions['onLog'];
  onCall?: RunOptions['onCall'];
}

type Outcome = { ok: true; value: unknown } | { ok: false; error: { name: string; message: string } };
type ReplayEntry = { fn: string; input: string } & ({ kind: 'recorded'; outcome: Outcome } | { kind: 'decided'; decision: 'approve' | 'reject' });
export type ReplayTable = Map<number, ReplayEntry>;

const IDENT = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set(['arguments', 'eval', 'this', 'await', 'async', 'function', 'return', 'var', 'let', 'const', 'yield', 'class', 'new', 'console']);

export function resolveRun(options: RunOptions, runId: string, caps: Caps): ResolvedRun {
  const root = options.scope?.root ?? 'sdk';
  if (!IDENT.test(root) || RESERVED.has(root)) throw new SandboxError('InvalidRun', `scope.root "${root}" is not a valid identifier`);
  const values = options.scope?.values ?? {};
  for (const name of Object.keys(values)) {
    if (!IDENT.test(name) || RESERVED.has(name) || name === root) throw new SandboxError('InvalidRun', `scope.values key "${name}" is not a valid identifier`);
  }
  if (typeof options.code !== 'string') throw new SandboxError('InvalidRun', 'code must be a string');
  return {
    runId,
    code: options.code,
    functions: options.functions,
    root,
    values,
    spread: options.scope?.spread ?? false,
    approval: options.approval ?? { mode: 'deny' },
    caps: { ...caps, ...stripUndefined(options.caps ?? {}) },
    signal: options.signal,
    onLog: options.onLog,
    onCall: options.onCall,
  };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

export function executeRun(deps: RunDeps, run: ResolvedRun, replay: ReplayTable = new Map()): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    const start = deps.now();
    const logs: LogLine[] = [];
    const calls: CallRecord[] = [];
    const pending: PendingCall[] = [];
    const recorded: ReplayTable = new Map(replay);
    let opsUsed = 0;
    let logsDropped = 0;
    let outstanding = 0;
    let ended = false;
    let heard = false;
    let link: WorkerLink | null = null;
    let runTimer: ReturnType<typeof setTimeout> | null = null;
    let busyTimer: ReturnType<typeof setTimeout> | null = null;
    let runRemaining = run.caps.timeoutMs;
    let runArmedAt = 0;

    const base = () => ({ runId: run.runId, logs, calls, stats: { ms: deps.now() - start, opsUsed, logsDropped } });

    const finish = (result: RunResult, reusable: boolean) => {
      if (ended) return;
      ended = true;
      if (runTimer) clearTimeout(runTimer);
      if (busyTimer) clearTimeout(busyTimer);
      run.signal?.removeEventListener('abort', onAbort);
      if (link) {
        if (!reusable) {
          try {
            link.post({ t: 'abort', runId: run.runId });
          } catch {
            /* link gone */
          }
        }
        deps.release(link, reusable);
      }
      resolve(result);
    };

    const limit = (kind: LimitKind, message: string) => finish({ ...base(), status: 'limit', limit: kind, error: { name: 'SandboxLimit', message } }, false);

    const onAbort = () => finish({ ...base(), status: 'aborted' }, false);

    const armRun = () => {
      runArmedAt = deps.now();
      runTimer = setTimeout(() => limit('timeout', `timed out after ${run.caps.timeoutMs} ms`), runRemaining);
    };
    const pauseRun = () => {
      if (runTimer) clearTimeout(runTimer);
      runTimer = null;
      runRemaining = Math.max(0, runRemaining - (deps.now() - runArmedAt));
    };
    const armBusy = () => {
      if (busyTimer) clearTimeout(busyTimer);
      busyTimer = setTimeout(() => limit('busy', `the code ran ${run.caps.busyMs} ms with no function call in flight`), run.caps.busyMs);
    };
    const clearBusy = () => {
      if (busyTimer) clearTimeout(busyTimer);
      busyTimer = null;
    };

    const answer = (callId: string, outcome: Outcome | { pending: number }) => {
      if (ended || !link) return;
      try {
        if ('pending' in outcome) link.post({ t: 'result', runId: run.runId, callId, ok: true, pending: true, seq: outcome.pending });
        else if (outcome.ok) link.post({ t: 'result', runId: run.runId, callId, ok: true, value: outcome.value });
        else link.post({ t: 'result', runId: run.runId, callId, ok: false, error: outcome.error });
      } catch (err) {
        // The function returned something structured clone refuses.
        link.post({ t: 'result', runId: run.runId, callId, ok: false, error: { name: 'CloneError', message: errorShape(err).message } });
      }
    };

    const record = (seq: number, fn: string, input: unknown, startedAt: number, ok: boolean, extra: Partial<CallRecord> = {}) => {
      const rec: CallRecord = { seq, fn, input, ok, ms: deps.now() - startedAt, ...extra };
      calls.push(rec);
      run.onCall?.(rec);
    };

    const execute = async (fn: string, input: unknown): Promise<Outcome> => {
      const entry = run.functions[fn]!;
      try {
        const value = entry.positional && Array.isArray(input) ? await (entry.call as (...a: unknown[]) => unknown)(...input) : await entry.call(input);
        return { ok: true, value };
      } catch (err) {
        return { ok: false, error: errorShape(err) };
      }
    };

    const handleCall = async (msg: Extract<WorkerToHost, { t: 'call' }>) => {
      const startedAt = deps.now();
      outstanding++;
      clearBusy();
      opsUsed++;
      const done = (outcome: Outcome | { pending: number }, extra: Partial<CallRecord> = {}) => {
        const ok = 'pending' in outcome ? true : outcome.ok;
        record(msg.seq, msg.fn, msg.input, startedAt, ok, { ...extra, ...('pending' in outcome ? {} : outcome.ok ? {} : { error: `${outcome.error.name}: ${outcome.error.message}` }) });
        answer(msg.callId, outcome);
        outstanding--;
        if (outstanding === 0 && !ended) armBusy();
      };
      if (opsUsed > run.caps.maxOps) {
        record(msg.seq, msg.fn, msg.input, startedAt, false, { error: 'SandboxLimit: ops' });
        limit('ops', `more than ${run.caps.maxOps} function calls in one run`);
        return;
      }
      const entry = run.functions[msg.fn];
      if (!entry) {
        done({ ok: false, error: { name: 'UnknownFunction', message: `"${msg.fn}" is not a function the sandbox provides` } });
        return;
      }
      const inputBytes = byteSize(msg.input);
      if (inputBytes > run.caps.maxInputBytes) {
        record(msg.seq, msg.fn, msg.input, startedAt, false, { error: 'SandboxLimit: input' });
        limit('input', `call input larger than ${run.caps.maxInputBytes} bytes (${inputBytes})`);
        return;
      }
      const canon = canonicalJson(msg.input);
      const prior = recorded.get(msg.seq);
      if (prior) {
        if (prior.fn !== msg.fn || prior.input !== canon) {
          record(msg.seq, msg.fn, msg.input, startedAt, false, { error: 'ReplayMismatch' });
          answer(msg.callId, { ok: false, error: { name: 'ReplayMismatch', message: 'the code made a different call than the one approved' } });
          finish({ ...base(), status: 'error', error: { name: 'ReplayMismatch', message: `call ${msg.seq} differs from the recorded run (${prior.fn} vs ${msg.fn})` } }, false);
          return;
        }
        if (prior.kind === 'recorded') {
          done(prior.outcome, { decision: 'replayed' });
          return;
        }
        if (prior.decision === 'reject') {
          recorded.set(msg.seq, { fn: msg.fn, input: canon, kind: 'recorded', outcome: rejected() });
          done(rejected(), { decision: 'rejected' });
          return;
        }
        const outcome = await execute(msg.fn, msg.input);
        if (ended) return;
        if (!checkOutput(outcome)) return;
        recorded.set(msg.seq, { fn: msg.fn, input: canon, kind: 'recorded', outcome });
        done(outcome, { decision: 'approved' });
        return;
      }
      if (entry.approval) {
        const mode = run.approval.mode;
        if (mode === 'deny') {
          recorded.set(msg.seq, { fn: msg.fn, input: canon, kind: 'recorded', outcome: rejected() });
          done(rejected(), { decision: 'rejected' });
          return;
        }
        if (mode === 'collect') {
          pending.push({ callId: msg.callId, seq: msg.seq, fn: msg.fn, input: msg.input });
          done({ pending: msg.seq }, { decision: 'deferred' });
          return;
        }
        // pause
        pauseRun();
        let decision: 'approve' | 'reject';
        try {
          decision = await run.approval.onApproval({ runId: run.runId, callId: msg.callId, seq: msg.seq, fn: msg.fn, input: msg.input });
        } catch (err) {
          decision = 'reject';
          logs.push({ level: 'error', text: `onApproval failed: ${errorShape(err).message}`, at: deps.now() - start });
        }
        if (ended) return;
        armRun();
        if (decision !== 'approve') {
          recorded.set(msg.seq, { fn: msg.fn, input: canon, kind: 'recorded', outcome: rejected() });
          done(rejected(), { decision: 'rejected' });
          return;
        }
        const outcome = await execute(msg.fn, msg.input);
        if (ended) return;
        if (!checkOutput(outcome)) return;
        recorded.set(msg.seq, { fn: msg.fn, input: canon, kind: 'recorded', outcome });
        done(outcome, { decision: 'approved' });
        return;
      }
      const outcome = await execute(msg.fn, msg.input);
      if (ended) return;
      if (!checkOutput(outcome)) return;
      recorded.set(msg.seq, { fn: msg.fn, input: canon, kind: 'recorded', outcome });
      done(outcome);
    };

    const checkOutput = (outcome: Outcome): boolean => {
      if (!outcome.ok) return true;
      const bytes = byteSize(outcome.value);
      if (bytes > run.caps.maxOutputBytes) {
        limit('output', `a call result larger than ${run.caps.maxOutputBytes} bytes (${bytes})`);
        return false;
      }
      return true;
    };

    const onMessage = (msg: WorkerToHost) => {
      if (ended || msg.runId !== run.runId) return;
      heard = true;
      if (msg.t === 'log') {
        const line: LogLine = { level: msg.level, text: msg.text, at: deps.now() - start };
        logs.push(line);
        run.onLog?.(line);
      } else if (msg.t === 'call') {
        void handleCall(msg);
      } else if (msg.t === 'done') {
        opsUsed = Math.max(opsUsed, msg.opsUsed);
        logsDropped = msg.logsDropped;
        if (msg.ok) {
          const bytes = byteSize(msg.value);
          if (bytes > run.caps.maxOutputBytes) return limit('output', `result larger than ${run.caps.maxOutputBytes} bytes (${bytes})`);
          if (pending.length) return finish(pendingResult(), true);
          return finish({ ...base(), status: 'ok', value: msg.value }, true);
        }
        if (msg.tooLarge) return limit('output', msg.error.message);
        if (msg.pendingObserved && pending.length) return finish(pendingResult(), true);
        return finish({ ...base(), status: 'error', error: msg.error }, true);
      }
    };

    const pendingResult = (): RunResult => ({
      ...base(),
      status: 'pending',
      pending: pending.slice(),
      resume: (decisions: Decisions) => {
        const table: ReplayTable = new Map(recorded);
        const ids = new Set(pending.map((p) => p.callId));
        const decide = (callId: string, decision: 'approve' | 'reject') => {
          const p = pending.find((x) => x.callId === callId);
          if (!p) throw new SandboxError('BadDecision', `unknown callId "${callId}"`);
          table.set(p.seq, { fn: p.fn, input: canonicalJson(p.input), kind: 'decided', decision });
        };
        if ('all' in decisions) for (const p of pending) decide(p.callId, decisions.all);
        else {
          for (const id of decisions.approve ?? []) decide(id, 'approve');
          for (const id of decisions.reject ?? []) decide(id, 'reject');
          for (const id of ids) if (!table.has(pending.find((p) => p.callId === id)!.seq)) throw new SandboxError('BadDecision', `no decision for "${id}"`);
        }
        return executeRun(deps, run, table);
      },
    });

    if (run.signal?.aborted) {
      finish({ ...base(), status: 'aborted' }, true);
      return;
    }
    run.signal?.addEventListener('abort', onAbort, { once: true });

    deps.spawn().then(
      (l) => {
        if (ended) {
          deps.release(l, true);
          return;
        }
        link = l;
        link.onMessage(onMessage);
        link.onError((message) => {
          // Before the worker said anything, an error means it never started
          // (a host CSP without `worker-src blob:` in srcdoc mode, typically).
          if (!heard) finish({ ...base(), status: 'error', error: { name: 'SandboxUnavailable', message: `the worker could not start: ${message}` } }, false);
          else limit('crash', `the worker crashed: ${message}`);
        });
        armRun();
        armBusy();
        link.post({
          t: 'run',
          runId: run.runId,
          code: run.code,
          root: run.root,
          fnNames: Object.keys(run.functions),
          positional: Object.keys(run.functions).filter((n) => run.functions[n]!.positional === true),
          spread: run.spread,
          valueNames: Object.keys(run.values),
          values: run.values,
          caps: { maxOutputBytes: run.caps.maxOutputBytes, maxLogLines: run.caps.maxLogLines, maxLogChars: run.caps.maxLogChars },
          serialize: run.approval.mode === 'collect' || recorded.size > 0,
        });
      },
      (err) => finish({ ...base(), status: 'error', error: errorShape(err) }, true),
    );
  });
}

function rejected(): Outcome {
  return { ok: false, error: { name: 'ApprovalRejected', message: 'the user rejected this operation' } };
}
