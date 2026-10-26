import type { LogLevel } from '../bridge/protocol';
import type { FunctionMap } from '../functions/define';

export interface Caps {
  /** Wall-clock of the run, excluding time waiting for a human. Expiry → terminate(). */
  timeoutMs: number;
  /** Longest the worker may run with no function call in flight (busy-loop watchdog). */
  busyMs: number;
  /** Function calls per run. */
  maxOps: number;
  /** The run value and each call result, serialised. */
  maxOutputBytes: number;
  /** Each call input, serialised. */
  maxInputBytes: number;
  /** Console lines kept per run; the rest are dropped and counted. */
  maxLogLines: number;
  /** Console characters kept per run. */
  maxLogChars: number;
}

export const DEFAULT_CAPS: Caps = {
  timeoutMs: 60_000,
  busyMs: 10_000,
  maxOps: 200,
  maxOutputBytes: 1_000_000,
  maxInputBytes: 1_000_000,
  maxLogLines: 200,
  maxLogChars: 262_144,
};

export type FrameOptions = { url: string; srcdoc?: undefined } | { srcdoc: true; url?: undefined };

export interface SandboxOptions {
  frame: FrameOptions;
  caps?: Partial<Caps>;
  /** Boot the frame now instead of on the first run. */
  warm?: boolean;
  /** A fresh worker per run (default). `false` reuses one worker across runs. */
  workerPerRun?: boolean;
  /** Milliseconds to wait for the frame's handshake before `SandboxUnavailable`. */
  bootTimeoutMs?: number;
  /** Where the frame element is appended (default `document.body`). */
  container?: Element;
}

export type SandboxState = 'idle' | 'booting' | 'ready' | 'failed' | 'disposed';

export interface LogLine {
  level: LogLevel;
  text: string;
  /** ms since the run started */
  at: number;
}

export interface PendingCall {
  callId: string;
  seq: number;
  fn: string;
  input: unknown;
}

export interface CallRecord {
  seq: number;
  fn: string;
  input: unknown;
  ok: boolean;
  ms: number;
  decision?: 'approved' | 'rejected' | 'deferred' | 'replayed';
  error?: string;
}

export type Decisions = { all: 'approve' | 'reject' } | { approve?: string[]; reject?: string[] };

export type OnCallApproval = (call: PendingCall & { runId: string }) => Promise<'approve' | 'reject'>;
export type OnBatchApproval = (pending: PendingCall[], ctx: { runId: string }) => Promise<Decisions>;

export type ApprovalOptions =
  | { mode: 'deny' }
  | { mode: 'pause'; onApproval: OnCallApproval }
  | { mode: 'collect'; onApproval?: OnBatchApproval };

export interface RunOptions {
  code: string;
  functions: FunctionMap;
  scope?: {
    /** Name of the function tree inside the code. Default `sdk`. */
    root?: string;
    /** Values cloned into the worker and exposed by name. */
    values?: Record<string, unknown>;
  };
  approval?: ApprovalOptions;
  caps?: Partial<Caps>;
  signal?: AbortSignal;
  onLog?: (line: LogLine) => void;
  onCall?: (record: CallRecord) => void;
}

export type LimitKind = 'timeout' | 'busy' | 'ops' | 'output' | 'input' | 'crash';

export interface RunStats {
  ms: number;
  opsUsed: number;
  logsDropped: number;
}

interface RunCommon {
  runId: string;
  logs: LogLine[];
  calls: CallRecord[];
  stats: RunStats;
}

export type RunResult = RunCommon &
  (
    | { status: 'ok'; value: unknown }
    | { status: 'error'; error: { name: string; message: string; line?: number } }
    | { status: 'limit'; limit: LimitKind; error: { name: 'SandboxLimit'; message: string } }
    | { status: 'aborted' }
    | { status: 'pending'; pending: PendingCall[]; resume: (decisions: Decisions) => Promise<RunResult> }
  );
