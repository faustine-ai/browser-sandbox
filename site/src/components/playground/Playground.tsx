"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSandbox,
  defineFunctions,
  describe,
  type CallRecord,
  type Decisions,
  type FunctionMap,
  type LogLine,
  type PendingCall,
  type RunResult,
  type Sandbox,
} from "@faustine-ai/browser-sandbox";
import { CodeEditor } from "./CodeEditor";
import { EXAMPLES, FUNCTIONS_SOURCE } from "./examples";

type ApprovalMode = "deny" | "pause" | "collect";

/** Caps for this page: short enough that the limit examples end while you watch. */
const CAPS = { timeoutMs: 20_000, busyMs: 3_000, maxOps: 50 } as const;

type HostLine = { level: "host"; text: string; at: number };
type Line = (LogLine | HostLine) & { key: number };

type Pending = {
  calls: PendingCall[];
  mode: "pause" | "collect";
  resolve: (d: Decisions) => void;
};

type Phase = "idle" | "booting" | "running" | "pending" | "done";

const STATUS_STYLE: Record<RunResult["status"] | "running" | "functions", string> = {
  ok: "bg-mint/15 text-emerald-300 ring-mint/30",
  error: "bg-rose/15 text-rose-300 ring-rose/30",
  limit: "bg-amber/15 text-amber-300 ring-amber/40",
  aborted: "bg-white/10 text-white/70 ring-white/15",
  pending: "bg-amber/15 text-amber-300 ring-amber/40",
  running: "bg-iris/20 text-iris-200 ring-iris/40",
  functions: "bg-rose/15 text-rose-300 ring-rose/30",
};

export function Playground() {
  const [functionsSource, setFunctionsSource] = useState(FUNCTIONS_SOURCE);
  const [exampleId, setExampleId] = useState(EXAMPLES[0]!.id);
  const [code, setCode] = useState(EXAMPLES[0]!.code);
  const [mode, setMode] = useState<ApprovalMode>("collect");
  const [showIndex, setShowIndex] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [functionsError, setFunctionsError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const sandboxRef = useRef<Sandbox | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef(0);
  const keyRef = useRef(0);
  const outputRef = useRef<HTMLDivElement>(null);

  // One sandbox for the page, booted on arrival so the first run is instant.
  useEffect(() => {
    const sandbox = createSandbox({ frame: { srcdoc: true }, warm: true, caps: CAPS });
    sandboxRef.current = sandbox;
    return () => {
      sandbox.dispose();
      sandboxRef.current = null;
    };
  }, []);

  // Elapsed time while a run is in flight.
  useEffect(() => {
    if (phase !== "running" && phase !== "pending" && phase !== "booting") return;
    const t = setInterval(() => setElapsed(performance.now() - startedAt.current), 100);
    return () => clearInterval(t);
  }, [phase]);

  const pushLine = useCallback((l: LogLine | HostLine) => {
    setLines((prev) => [...prev, { ...l, key: keyRef.current++ }]);
  }, []);

  /** Evaluate the functions editor into a FunctionMap. This is the host's own code, run in the page on purpose. */
  const buildFunctions = useCallback((): FunctionMap => {
    const log = (...args: unknown[]) => pushLine({ level: "host", text: args.map(fmt).join(" "), at: performance.now() - startedAt.current });
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const factory = new Function("defineFunctions", "log", "sleep", functionsSource) as (
      d: typeof defineFunctions,
      l: typeof log,
      s: typeof sleep,
    ) => unknown;
    const map = factory(defineFunctions, log, sleep);
    if (!map || typeof map !== "object") throw new Error("The functions editor must `return defineFunctions({ … })`.");
    return map as FunctionMap;
  }, [functionsSource, pushLine]);

  const index = useMemo(() => {
    try {
      const factory = new Function("defineFunctions", "log", "sleep", functionsSource) as (d: typeof defineFunctions, l: () => void, s: () => Promise<void>) => unknown;
      const map = factory(defineFunctions, () => {}, () => Promise.resolve());
      return map && typeof map === "object" ? describe(map as FunctionMap) : "";
    } catch (e) {
      return `// ${String(e)}`;
    }
  }, [functionsSource]);

  const selectExample = (id: string) => {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    setExampleId(id);
    setCode(ex.code);
  };
  const example = EXAMPLES.find((e) => e.id === exampleId) ?? EXAMPLES[0]!;

  const run = async () => {
    const sandbox = sandboxRef.current;
    if (!sandbox || phase === "running" || phase === "pending" || phase === "booting") return;

    setLines([]);
    setCalls([]);
    setResult(null);
    setFunctionsError(null);
    setPending(null);
    setElapsed(0);
    startedAt.current = performance.now();
    setPhase(sandbox.state === "ready" ? "running" : "booting");

    if (window.innerWidth < 1024) outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    let functions: FunctionMap;
    try {
      functions = buildFunctions();
    } catch (e) {
      setFunctionsError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      setPhase("done");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const ask = (calls: PendingCall[], m: "pause" | "collect") =>
      new Promise<Decisions>((resolve) => {
        setPending({ calls, mode: m, resolve });
        setPhase("pending");
      });

    const approval =
      mode === "deny"
        ? { mode: "deny" as const }
        : mode === "pause"
          ? {
              mode: "pause" as const,
              onApproval: async (call: PendingCall) => {
                const d = await ask([call], "pause");
                setPending(null);
                setPhase("running");
                return "all" in d && d.all === "approve" ? ("approve" as const) : ("reject" as const);
              },
            }
          : {
              mode: "collect" as const,
              onApproval: async (calls: PendingCall[]) => {
                const d = await ask(calls, "collect");
                setPending(null);
                setPhase("running");
                return d;
              },
            };

    const res = await sandbox.run({
      code,
      functions,
      approval,
      signal: controller.signal,
      onLog: (line) => pushLine(line),
      onCall: (record) => setCalls((prev) => [...prev, record]),
    });

    abortRef.current = null;
    setResult(res);
    setPhase("done");
    setElapsed(res.stats.ms);
  };

  const stop = () => {
    pending?.resolve({ all: "reject" });
    setPending(null);
    abortRef.current?.abort();
  };

  const decide = (d: Decisions) => pending?.resolve(d);

  const busy = phase === "running" || phase === "pending" || phase === "booting";
  const status: keyof typeof STATUS_STYLE | null = functionsError ? "functions" : result ? result.status : phase === "pending" ? "pending" : busy ? "running" : null;

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      {/* ─────────── Left: the two editors ─────────── */}
      <div className="grid gap-5">
        <Panel
          title="Functions"
          eyebrow="Host · runs in the page"
          actions={
            <button type="button" onClick={() => setShowIndex((v) => !v)} className="panel-chip" aria-expanded={showIndex}>
              {showIndex ? "Hide" : "Show"} what the model sees
            </button>
          }
        >
          <CodeEditor label="Functions, the host side" value={functionsSource} onChange={setFunctionsSource} minLines={10} maxLines={18} />
          {showIndex ? (
            <div className="border-t border-ink-line px-4 py-3">
              <p className="mono-label text-white/35">describe(functions)</p>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[0.76rem] leading-relaxed text-white/75">{index}</pre>
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Agent code"
          eyebrow="Sandbox · runs in the Worker"
          actions={
            <label className="flex items-center gap-2 text-[0.78rem] text-white/60">
              <span className="hidden sm:inline">Example</span>
              <select
                value={exampleId}
                onChange={(e) => selectExample(e.target.value)}
                className="h-8 max-w-[11rem] rounded-full border border-white/15 bg-white/[0.06] px-3 text-[0.78rem] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-iris"
              >
                {EXAMPLES.map((ex) => (
                  <option key={ex.id} value={ex.id} className="text-zinc-900">
                    {ex.label}
                  </option>
                ))}
              </select>
            </label>
          }
        >
          <CodeEditor label="Agent code, the sandboxed side" value={code} onChange={setCode} minLines={10} maxLines={20} />
          <div className="border-t border-ink-line px-4 py-3 text-[0.8rem] leading-relaxed text-white/55">{example.hint}</div>
        </Panel>
      </div>

      {/* ─────────── Right: run + output ─────────── */}
      <div ref={outputRef} className="scroll-mt-24 lg:sticky lg:top-24">
        <Panel
          title="Output"
          eyebrow="RunResult"
          scroll
          toolbar={
            <>
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-line px-4 py-3">
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-iris px-5 text-[0.9rem] font-medium text-white shadow-[0_10px_30px_-10px_rgba(108,92,231,0.7)] transition-all hover:bg-iris-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
              Run
            </button>
            <button
              type="button"
              onClick={stop}
              disabled={!busy}
              className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-[0.9rem] font-medium text-white/80 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
              Stop
            </button>

            <div className="ml-auto flex items-center gap-1 rounded-full bg-white/[0.05] p-1 ring-1 ring-inset ring-white/10" role="radiogroup" aria-label="Approval mode">
              {(["deny", "pause", "collect"] as ApprovalMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  disabled={busy}
                  className={`h-7 rounded-full px-3 font-mono text-[0.72rem] transition-colors disabled:opacity-60 ${
                    mode === m ? "bg-white/[0.12] text-white" : "text-white/55 hover:text-white"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

            </>
          }
          actions={
            status ? (
              <span className={`inline-flex h-7 items-center rounded-full px-2.5 font-mono text-[0.7rem] font-medium uppercase tracking-wider ring-1 ring-inset ${STATUS_STYLE[status]}`}>
                {status === "functions" ? "functions" : status}
                {status === "running" ? <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> : null}
              </span>
            ) : null
          }
        >
          <div className="px-4 py-3">
            <p className="font-mono text-[0.7rem] text-white/40">
              {busy ? `${(elapsed / 1000).toFixed(1)} s` : result ? `${Math.round(result.stats.ms)} ms · ${result.stats.opsUsed} calls · ${result.logs.length} log lines${result.stats.logsDropped ? ` (+${result.stats.logsDropped} dropped)` : ""}` : "Not run yet"}
              <span className="text-white/25"> · caps timeout {CAPS.timeoutMs / 1000} s · busy {CAPS.busyMs / 1000} s · {CAPS.maxOps} ops · frame srcdoc</span>
            </p>
          </div>

          {/* Approval card */}
          {pending ? (
            <div className="px-4 pb-4">
              <ApprovalPrompt pending={pending} onDecide={decide} />
            </div>
          ) : null}

          {/* Functions error */}
          {functionsError ? (
            <Section label="Functions editor">
              <pre className="whitespace-pre-wrap font-mono text-[0.8rem] leading-relaxed text-rose-300">{functionsError}</pre>
            </Section>
          ) : null}

          {/* Result */}
          {result ? <ResultView result={result} /> : null}

          {/* Console */}
          <Section label="Console" count={lines.length}>
            {lines.length === 0 ? (
              <p className="font-mono text-[0.78rem] text-white/30">{busy ? "…" : "console.log in the agent code and log() in the functions land here."}</p>
            ) : (
              <ol className="space-y-1">
                {lines.map((l) => (
                  <li key={l.key} className="flex gap-3 font-mono text-[0.78rem] leading-relaxed">
                    <span className="w-16 shrink-0 whitespace-nowrap text-right tabular-nums text-white/30">{Math.round(l.at)} ms</span>
                    <span className={`w-11 shrink-0 ${LEVEL_COLOR[l.level] ?? "text-white/50"}`}>{l.level}</span>
                    <span className="min-w-0 whitespace-pre-wrap break-words text-white/85">{l.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          {/* Calls */}
          <Section label="Calls" count={calls.length} last>
            {calls.length === 0 ? (
              <p className="font-mono text-[0.78rem] text-white/30">Every function call that crossed the bridge, with its decision.</p>
            ) : (
              <ol className="space-y-1.5">
                {calls.map((c) => (
                  <li key={c.seq} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[0.78rem] leading-relaxed">
                    <span className="w-6 shrink-0 text-right tabular-nums text-white/30">{c.seq}</span>
                    <span className="font-semibold text-white">{c.fn}</span>
                    <span className="min-w-0 break-all text-white/50">{fmt(c.input)}</span>
                    <span className={`ml-auto ${c.ok ? "text-emerald-300" : "text-rose-300"}`}>
                      {c.decision ? `${c.decision} · ` : ""}
                      {c.ok ? "ok" : (c.error ?? "error")}
                    </span>
                    <span className="tabular-nums text-white/30">{Math.round(c.ms)} ms</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </Panel>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

const LEVEL_COLOR: Record<string, string> = {
  log: "text-white/50",
  info: "text-sky-300",
  warn: "text-amber-300",
  error: "text-rose-300",
  debug: "text-white/40",
  host: "text-iris-300",
};

function Panel({
  title,
  eyebrow,
  actions,
  toolbar,
  scroll = false,
  children,
}: {
  title: string;
  eyebrow: string;
  actions?: React.ReactNode;
  /** Rendered under the header, outside the scrolling body. */
  toolbar?: React.ReactNode;
  /** On large screens: cap the panel to the viewport and scroll the body, so the toolbar stays put. */
  scroll?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-ink-line bg-ink-2 shadow-iris ${scroll ? "lg:flex lg:max-h-[calc(100vh-7rem)] lg:flex-col" : ""}`}
      aria-label={title}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[0.95rem] font-semibold text-white">{title}</h2>
          <p className="mono-label text-white/35">{eyebrow}</p>
        </div>
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </header>
      {toolbar}
      {scroll ? <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{children}</div> : children}
    </section>
  );
}

function Section({ label, count, last = false, children }: { label: string; count?: number; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={`px-4 py-3 ${last ? "" : "border-b border-ink-line"}`}>
      <p className="mono-label flex items-center gap-2 text-white/35">
        {label}
        {count !== undefined && count > 0 ? <span className="rounded-full bg-white/10 px-1.5 py-px text-[0.62rem] text-white/60">{count}</span> : null}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ResultView({ result }: { result: RunResult }) {
  switch (result.status) {
    case "ok":
      return (
        <Section label="Return value">
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.8rem] leading-relaxed text-emerald-100">{fmt(result.value, 2)}</pre>
        </Section>
      );
    case "error":
      return (
        <Section label="Error">
          <p className="font-mono text-[0.8rem] leading-relaxed text-rose-300">
            {result.error.name}: {result.error.message}
            {result.error.line !== undefined ? <span className="text-rose-300/60"> (line {result.error.line})</span> : null}
          </p>
        </Section>
      );
    case "limit":
      return (
        <Section label={`Limit · ${result.limit}`}>
          <p className="font-mono text-[0.8rem] leading-relaxed text-amber-200">{result.error.message}</p>
          <p className="mt-1.5 text-[0.78rem] text-white/50">The worker was terminated. Nothing after the limit ran.</p>
        </Section>
      );
    case "aborted":
      return (
        <Section label="Aborted">
          <p className="font-mono text-[0.8rem] text-white/70">The AbortSignal fired; the worker was terminated.</p>
        </Section>
      );
    case "pending":
      return (
        <Section label="Pending">
          <p className="font-mono text-[0.8rem] text-amber-200">{result.pending.length} call(s) wait for a decision.</p>
        </Section>
      );
  }
}

/** The card a host draws for a pending decision: rows from the sandbox, two fixed buttons. */
function ApprovalPrompt({ pending, onDecide }: { pending: Pending; onDecide: (d: Decisions) => void }) {
  const n = pending.calls.length;
  return (
    <div className="overflow-hidden rounded-xl border border-rose-300/40 bg-white text-zinc-900" role="group" aria-label="Approval">
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.92rem] font-semibold">
            {pending.mode === "pause" ? "This call needs your approval" : `${n} operation${n === 1 ? "" : "s"} need your approval`}
          </p>
          <p className="text-[0.8rem] text-zinc-500">
            {pending.mode === "pause" ? "The run is paused on this call." : "The run was cut before the first one. Approve to replay it with your decision."}
          </p>
        </div>
        <span className="mt-0.5 inline-flex h-[22px] shrink-0 items-center rounded-full border border-amber/60 bg-amber/10 px-2.5 text-[11px] font-medium text-amber-700">your UI</span>
      </div>
      <ul className="mx-4 mb-3 space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
        {pending.calls.map((c) => (
          <li key={c.callId} className="flex flex-wrap items-baseline gap-x-2 text-[0.8rem]">
            <span className="font-mono text-[0.72rem] text-zinc-400">#{c.seq}</span>
            <span className="font-mono font-semibold">{c.fn}</span>
            <code className="font-mono text-[0.74rem] text-zinc-500">{fmt(c.input)}</code>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5">
        <button type="button" onClick={() => onDecide({ all: "reject" })} className="inline-flex h-8 items-center rounded-full px-3.5 text-[0.8rem] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-300 hover:bg-white">
          Reject
        </button>
        <button type="button" onClick={() => onDecide({ all: "approve" })} className="inline-flex h-8 items-center rounded-full bg-rose-600 px-3.5 text-[0.8rem] font-medium text-white hover:bg-rose-700">
          {pending.mode === "pause" ? "Approve" : n === 1 ? "Approve it" : `Approve all ${n}`}
        </button>
      </div>
    </div>
  );
}

function fmt(v: unknown, indent = 0): string {
  if (v === undefined) return "undefined";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, indent) ?? String(v);
  } catch {
    return String(v);
  }
}
