import type { RunResult } from './types';

export type ToolOutput = { ok: true; result: unknown; logs?: string[] } | { ok: false; error: string; logs?: string[] };

/** A run result in the shape a chat tool returns, worded for a model. */
export function toToolOutput(result: RunResult): ToolOutput {
  const logs = result.logs.length ? result.logs.map((l) => `[${l.level}] ${l.text}`) : undefined;
  const withLogs = <T extends object>(o: T): T & { logs?: string[] } => (logs ? { ...o, logs } : o);
  switch (result.status) {
    case 'ok':
      return withLogs({ ok: true, result: result.value === undefined ? null : result.value });
    case 'error':
      return withLogs({ ok: false, error: `${result.error.name !== 'Error' ? `${result.error.name}: ` : ''}${result.error.message}${result.error.line ? ` (line ${result.error.line})` : ''}` });
    case 'limit':
      return withLogs({ ok: false, error: `Denied (sandbox_limit): ${result.error.message}` });
    case 'aborted':
      return withLogs({ ok: false, error: 'The run was cancelled.' });
    case 'pending': {
      const n = result.pending.length;
      const lines = result.pending.map((p) => `  - ${p.fn} ${safeJson(p.input)}`).join('\n');
      return withLogs({
        ok: false,
        error:
          `Paused: ${n} operation${n === 1 ? '' : 's'} in this code need the user's approval and were NOT run. ` +
          `Everything else ran and its results are held.\n${lines}\nDo not claim any of this ran.`,
      });
    }
  }
}

function safeJson(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s.length > 400 ? `${s.slice(0, 400)}…` : s;
  } catch {
    return String(v);
  }
}
