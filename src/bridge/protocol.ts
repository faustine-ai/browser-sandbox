// The wire between the page, the frame relay and the worker. Everything here
// crosses by structured clone; nothing else ever does.

export const PROTOCOL_VERSION = 1;

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface ErrorShape {
  name: string;
  message: string;
  /** 1-based line inside the model's code, best effort. */
  line?: number;
}

/** The caps the worker enforces itself (the host enforces the rest). */
export interface WireCaps {
  maxOutputBytes: number;
  maxLogLines: number;
  maxLogChars: number;
}

// ---- page → worker --------------------------------------------------------

export interface RunMessage {
  t: 'run';
  runId: string;
  code: string;
  /** Name of the function tree inside the code (`sdk`). */
  root: string;
  /** Dotted function names the tree exposes. */
  fnNames: string[];
  /** Extra identifiers the code sees, with their cloned values. */
  valueNames: string[];
  values: Record<string, unknown>;
  caps: WireCaps;
  /** Serialise calls in creation order (collect mode: a deterministic replay). */
  serialize: boolean;
}

export type ResultMessage = { t: 'result'; runId: string; callId: string } & (
  | { ok: true; value: unknown }
  | { ok: true; pending: true; seq: number }
  | { ok: false; error: ErrorShape }
);

export interface AbortMessage {
  t: 'abort';
  runId: string;
}

export type HostToWorker = RunMessage | ResultMessage | AbortMessage;

// ---- worker → page --------------------------------------------------------

export interface CallMessage {
  t: 'call';
  runId: string;
  callId: string;
  seq: number;
  fn: string;
  input: unknown;
}

export interface LogMessage {
  t: 'log';
  runId: string;
  level: LogLevel;
  text: string;
}

export type DoneMessage = { t: 'done'; runId: string; opsUsed: number; logsDropped: number } & (
  | { ok: true; value: unknown }
  | { ok: false; error: ErrorShape; pendingObserved?: boolean; tooLarge?: boolean }
);

export type WorkerToHost = CallMessage | LogMessage | DoneMessage;

export function isWorkerToHost(data: unknown): data is WorkerToHost {
  if (!data || typeof data !== 'object') return false;
  const t = (data as { t?: unknown }).t;
  const runId = (data as { runId?: unknown }).runId;
  return (t === 'call' || t === 'log' || t === 'done') && typeof runId === 'string';
}

// ---- page ↔ frame (control) ----------------------------------------------

export const READY = 'faustine-sandbox:ready';
export const INIT = 'faustine-sandbox:init';

export interface ReadyMessage {
  t: typeof READY;
  v: number;
}
export interface InitMessage {
  t: typeof INIT;
  nonce: string;
  v: number;
}
export interface SpawnMessage {
  t: 'spawn';
  nonce: string;
  id: string;
  source: string;
  sourceHash: string;
}
export interface KillMessage {
  t: 'kill';
  nonce: string;
  id: string;
}
export type HostToFrame = SpawnMessage | KillMessage;
export type FrameToHost =
  | { t: 'spawned'; id: string }
  | { t: 'spawn-error'; id: string; message: string }
  | { t: 'worker-error'; id: string; message: string }
  | { t: 'killed'; id: string };
