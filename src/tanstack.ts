// TanStack AI adapter: the sandbox as an `IsolateDriver`. Bindings become
// bare `external_<name>(input)` functions, as TanStack's code expects.
// Shapes are structural; nothing is imported at runtime.
import type { Sandbox } from './core/sandbox';
import type { ApprovalOptions, Caps, RunResult } from './core/types';
import { defineFunctions, type FunctionEntry } from './functions/define';

export type TanstackToolBinding =
  | ((input: unknown) => unknown)
  | { execute?: (input: unknown) => unknown; fn?: (input: unknown) => unknown; call?: (input: unknown) => unknown; handler?: (input: unknown) => unknown; description?: string; needsApproval?: boolean };

export interface TanstackIsolateConfig {
  bindings: Record<string, TanstackToolBinding>;
  timeout?: number;
  memoryLimit?: number;
}

export interface TanstackExecutionResult<T = unknown> {
  success: boolean;
  value?: T;
  logs?: string[];
  error?: { name: string; message: string };
}

export interface TanstackIsolateContext {
  execute<T = unknown>(code: string): Promise<TanstackExecutionResult<T>>;
  dispose(): Promise<void>;
}

export interface TanstackIsolateDriver {
  createContext(config: TanstackIsolateConfig): Promise<TanstackIsolateContext>;
}

export interface AsIsolateDriverOptions {
  /** Prefix of the bare function names. Default `external_`. */
  prefix?: string;
  approval?: ApprovalOptions;
  caps?: Partial<Caps>;
}

function callableOf(b: TanstackToolBinding): ((input: unknown) => unknown) | null {
  if (typeof b === 'function') return b;
  for (const k of ['execute', 'fn', 'call', 'handler'] as const) {
    const f = b[k];
    if (typeof f === 'function') return f;
  }
  return null;
}

/** The sandbox as a TanStack AI isolate driver. */
export function asIsolateDriver(sandbox: Sandbox, options: AsIsolateDriverOptions = {}): TanstackIsolateDriver {
  const prefix = options.prefix ?? 'external_';
  return {
    async createContext(config) {
      const defs: Record<string, FunctionEntry> = {};
      for (const [key, binding] of Object.entries(config.bindings)) {
        const fn = callableOf(binding);
        if (!fn) continue;
        const name = `${prefix}${key.replace(/[^\w$]/g, '_')}`;
        const entry: FunctionEntry = { call: fn };
        if (typeof binding === 'object' && binding.description) entry.description = binding.description;
        if (typeof binding === 'object' && binding.needsApproval) entry.approval = true;
        defs[name] = entry;
      }
      const functions = defineFunctions(defs);
      const caps: Partial<Caps> = { ...options.caps };
      if (config.timeout) caps.timeoutMs = config.timeout;
      let disposed = false;
      return {
        async execute<T>(code: string): Promise<TanstackExecutionResult<T>> {
          if (disposed) return { success: false, error: { name: 'Error', message: 'context disposed' } };
          const result = await sandbox.run({ code, functions, scope: { spread: true }, approval: options.approval, caps });
          return toExecutionResult<T>(result);
        },
        async dispose() {
          disposed = true;
        },
      };
    },
  };
}

export function toExecutionResult<T>(result: RunResult): TanstackExecutionResult<T> {
  const logs = result.logs.map((l) => l.text);
  switch (result.status) {
    case 'ok':
      return { success: true, value: result.value as T, logs };
    case 'error':
      return { success: false, error: { name: result.error.name, message: result.error.message }, logs };
    case 'limit':
      return { success: false, error: { name: 'SandboxLimit', message: `${result.limit}: ${result.error.message}` }, logs };
    case 'aborted':
      return { success: false, error: { name: 'Aborted', message: 'the run was cancelled' }, logs };
    case 'pending':
      return { success: false, error: { name: 'ApprovalPending', message: `${result.pending.length} operation(s) need the user's approval and did not run` }, logs };
  }
}
