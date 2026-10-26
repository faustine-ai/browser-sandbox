// Cloudflare `@cloudflare/codemode` adapter: the sandbox as an `Executor`.
// The shapes are declared structurally; nothing is imported at runtime.
import type { Sandbox } from './core/sandbox';
import type { ApprovalOptions, Caps, RunResult } from './core/types';
import { defineFunctions, type FunctionEntry } from './functions/define';

export interface CodemodeResolvedProvider {
  name: string;
  fns: Record<string, (...args: unknown[]) => Promise<unknown>>;
  positionalArgs?: boolean;
}

export interface CodemodeExecuteResult {
  result: unknown;
  error?: string;
  logs?: string[];
}

export interface CodemodeExecutor {
  execute(code: string, providersOrFns: CodemodeResolvedProvider[] | Record<string, (...args: unknown[]) => Promise<unknown>>): Promise<CodemodeExecuteResult>;
}

export interface AsExecutorOptions {
  /** Name of the object the code calls functions on. Default `codemode`. */
  root?: string;
  approval?: ApprovalOptions;
  /** Which function names need approval. */
  needsApproval?: (name: string) => boolean;
  caps?: Partial<Caps>;
  signal?: AbortSignal;
}

/** The sandbox as a codemode `Executor`; a plain record exposes `root.<fn>(...args)`, providers `root.<provider>.<fn>`. */
export function asExecutor(sandbox: Sandbox, options: AsExecutorOptions = {}): CodemodeExecutor {
  return {
    async execute(code, providersOrFns) {
      const defs: Record<string, FunctionEntry> = {};
      const add = (name: string, fn: (...args: unknown[]) => unknown, positional: boolean) => {
        const entry: FunctionEntry = { call: fn as FunctionEntry['call'], positional };
        if (options.needsApproval?.(name)) entry.approval = true;
        defs[name] = entry;
      };
      if (Array.isArray(providersOrFns)) {
        for (const p of providersOrFns) for (const [k, fn] of Object.entries(p.fns)) add(`${p.name}.${k}`, fn, p.positionalArgs !== false);
      } else {
        for (const [k, fn] of Object.entries(providersOrFns)) add(k, fn, true);
      }
      const result = await sandbox.run({ code, functions: defineFunctions(defs), scope: { root: options.root ?? 'codemode' }, approval: options.approval, caps: options.caps, signal: options.signal });
      return toExecuteResult(result);
    },
  };
}

export function toExecuteResult(result: RunResult): CodemodeExecuteResult {
  const logs = result.logs.map((l) => l.text);
  switch (result.status) {
    case 'ok':
      return { result: result.value, logs };
    case 'error':
      return { result: undefined, error: `${result.error.name}: ${result.error.message}`, logs };
    case 'limit':
      return { result: undefined, error: `sandbox_limit (${result.limit}): ${result.error.message}`, logs };
    case 'aborted':
      return { result: undefined, error: 'aborted', logs };
    case 'pending':
      return { result: undefined, error: `paused: ${result.pending.length} operation(s) need the user's approval and did not run: ${result.pending.map((p) => p.fn).join(', ')}`, logs };
  }
}
