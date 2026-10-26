import type { LogLevel } from '../bridge/protocol';

export interface CapturedConsole {
  console: Record<string, (...args: unknown[]) => void>;
  dropped(): number;
}

const LEVELS: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

/** A console whose output goes to the host as lines, capped; the rest is counted. */
export function makeConsole(emit: (level: LogLevel, text: string) => void, caps: { maxLogLines: number; maxLogChars: number }): CapturedConsole {
  let lines = 0;
  let chars = 0;
  let dropped = 0;
  const write = (level: LogLevel, args: unknown[]) => {
    if (lines >= caps.maxLogLines || chars >= caps.maxLogChars) {
      dropped++;
      return;
    }
    let text = args.map(formatArg).join(' ');
    const room = caps.maxLogChars - chars;
    if (text.length > room) text = `${text.slice(0, Math.max(0, room - 1))}…`;
    lines++;
    chars += text.length;
    emit(level, text);
  };
  const console: Record<string, (...args: unknown[]) => void> = {};
  for (const level of LEVELS) console[level] = (...args: unknown[]) => write(level, args);
  console.trace = console.debug!;
  console.table = console.log!;
  console.dir = console.log!;
  console.assert = (cond: unknown, ...args: unknown[]) => {
    if (!cond) write('error', ['Assertion failed:', ...args]);
  };
  for (const noop of ['group', 'groupEnd', 'groupCollapsed', 'time', 'timeEnd', 'timeLog', 'count', 'countReset', 'clear', 'profile', 'profileEnd', 'timeStamp']) console[noop] = () => {};
  return { console, dropped: () => dropped };
}

export function formatArg(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === 'function') return `[function ${v.name || 'anonymous'}]`;
  if (typeof v === 'symbol' || typeof v === 'bigint') return String(v);
  try {
    const s = JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? String(x) : x));
    return s === undefined ? String(v) : s;
  } catch {
    return String(v);
  }
}
