import { SandboxError } from '../core/errors';

export type FunctionImpl = (input: unknown) => unknown;

export interface FunctionEntry {
  call: FunctionImpl;
  /** Hold this call for a human (per the run's approval mode). */
  approval?: boolean;
  /** The code calls it with several arguments; `call` receives them spread. */
  positional?: boolean;
  /** For `describe()`. */
  description?: string;
  /** A JSON Schema of the input, for `describe()`. */
  input?: unknown;
}

export type FunctionMap = Readonly<Record<string, FunctionEntry>>;

const SEGMENT = /^[A-Za-z_$][\w$]*$/;
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

/** A dotted name of identifier segments, none of them a prototype key. */
export function isFunctionName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0 || name.length > 256) return false;
  const parts = name.split('.');
  return parts.every((p) => SEGMENT.test(p) && !FORBIDDEN.has(p));
}

/** The only door into the sandbox: a name → function map, each with its policy. */
export function defineFunctions(defs: Record<string, FunctionImpl | FunctionEntry>): FunctionMap {
  const out: Record<string, FunctionEntry> = Object.create(null);
  for (const [name, def] of Object.entries(defs)) {
    if (!isFunctionName(name)) throw new SandboxError('InvalidRun', `Invalid function name "${name}"`);
    const entry: FunctionEntry = typeof def === 'function' ? { call: def } : { ...def };
    if (typeof entry.call !== 'function') throw new SandboxError('InvalidRun', `Function "${name}" has no call`);
    out[name] = entry;
  }
  return Object.freeze(out);
}

export interface FromObjectOptions {
  /** The dotted names to expose. Names are never enumerated from the object. */
  names: string[];
  approval?: (name: string) => boolean;
  descriptions?: (name: string) => string | undefined;
  /** More entries, defined as in `defineFunctions`. */
  extra?: Record<string, FunctionImpl | FunctionEntry>;
}

/** Resolves `a.b.c` on the object at call time, so lazy objects work. */
export function fromObject(object: unknown, options: FromObjectOptions): FunctionMap {
  const defs: Record<string, FunctionImpl | FunctionEntry> = {};
  for (const name of options.names) {
    if (!isFunctionName(name)) throw new SandboxError('InvalidRun', `Invalid function name "${name}"`);
    const entry: FunctionEntry = {
      call: (input: unknown) => {
        const parts = name.split('.');
        let holder: unknown = object;
        let fn: unknown = object;
        for (const p of parts) {
          holder = fn;
          fn = fn != null && (typeof fn === 'object' || typeof fn === 'function') ? (fn as Record<string, unknown>)[p] : undefined;
        }
        if (typeof fn !== 'function') throw new SandboxError('UnknownFunction', `"${name}" is not available`);
        return (fn as (this: unknown, input: unknown) => unknown).call(holder, input);
      },
    };
    const approval = options.approval?.(name);
    if (approval) entry.approval = true;
    const description = options.descriptions?.(name);
    if (description) entry.description = description;
    defs[name] = entry;
  }
  Object.assign(defs, options.extra ?? {});
  return defineFunctions(defs);
}
