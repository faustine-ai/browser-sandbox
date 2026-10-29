import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Reveal } from "@/components/Reveal";
import { Architecture } from "@/components/Architecture";
import { Code } from "@/components/Code";
import { InstallCommand } from "@/components/InstallCommand";
import { ApprovalCard } from "@/components/ApprovalCard";
import { Container, Eyebrow, Button, ArrowRight, Icons, SectionHead } from "@/components/ui";
import { LINKS } from "@/lib/links";

export const metadata: Metadata = {
  title: { absolute: "browser-sandbox — Run agent-generated code in your web app, safely" },
  alternates: { canonical: "/" },
};

/**
 * The home page says what the library does, why the code cannot run in the
 * page, how the two calls work, how approval works, and what the sandbox
 * enforces. Plain and technical; the docs (built from the README) carry the
 * rest.
 */

const OPTIONS: { t: string; code: string; rows: [string, string, string]; verdict: string }[] = [
  {
    t: "In the page",
    code: "new Function(code) / eval",
    rows: ["yes, with the session", "yes", "no"],
    verdict: "The code gets everything the page has. Text the model read on the way can run script on your origin.",
  },
  {
    t: "In a Worker from the page",
    code: "new Worker(blobUrl)",
    rows: ["yes, same origin, cookies on fetch", "no", "yes"],
    verdict: "Still your origin: fetch carries the session, and the CSP needs worker-src blob:. No app state either.",
  },
  {
    t: "In this library",
    code: "Worker inside <iframe sandbox>",
    rows: ["no: connect-src 'none'", "no", "yes"],
    verdict: "The code reaches your app only through the functions you define, which run in your page, one call at a time.",
  },
];

const SECURITY = [
  { icon: Icons.Offline, t: "No network", b: "The frame has an opaque origin and a CSP with connect-src 'none'. The worker inherits it: fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, importScripts and import() are refused by the browser." },
  { icon: Icons.Layers, t: "No DOM, no storage", b: "window, document, parent, localStorage, indexedDB and caches do not exist in the worker. location is gone; assigning it navigates nothing." },
  { icon: Icons.Door, t: "Only the functions you define", b: "The code sees a tree of the names in defineFunctions and nothing else. A name outside the map runs nothing. __proto__, constructor and prototype are refused as names." },
  { icon: Icons.Clone, t: "Structured clone across the boundary", b: "Inputs and results travel by structured clone over a private MessageChannel. JSON, Date, Map, Set, typed arrays, File and Blob cross; functions, DOM nodes and class instances do not." },
  { icon: Icons.Key, t: "A private channel", b: "The frame accepts one init from its parent and ignores messages without the nonce. The page accepts the handshake only from the frame it created. The code cannot reach the port." },
  { icon: Icons.Gauge, t: "Limits that terminate", b: "A wall clock for the run, a busy-loop watchdog, a cap on calls, input bytes, output bytes and log lines. Any limit terminates the worker; while (true) {} ends in seconds." },
  { icon: Icons.Stop, t: "Cancellation", b: "An AbortSignal on run ends it with status aborted and terminates the worker, mid-loop if needed." },
  { icon: Icons.Shield, t: "No fallback to the page", b: "If the frame or the worker cannot start, run resolves SandboxUnavailable. Nothing is ever compiled in the page." },
  { icon: Icons.Doc, t: "Works under a strict CSP", b: "Serve the frame document from a route (url mode) and your page needs only frame-src for that origin. No 'unsafe-eval', no worker-src." },
];

const DEFINE = `import { createSandbox, defineFunctions } from '@faustine-ai/browser-sandbox';

const sandbox = createSandbox({ frame: { url: '/sandbox' }, warm: true });

const functions = defineFunctions({
  'orders.list':   (input) => api.orders.list(input),
  'orders.cancel': { call: (input) => api.orders.cancel(input), approval: true },
});`;

const RUN = `const result = await sandbox.run({
  code,            // the body of an async function, written by the model
  functions,
  approval: { mode: 'collect' },
});

switch (result.status) {
  case 'ok':      return result.value;
  case 'error':   return result.error.message;   // TypeError: … (line 3)
  case 'limit':   return result.error.message;   // the code ran 10000 ms with no call in flight
  case 'aborted': return 'cancelled';
  case 'pending': return askTheUser(result);     // marked calls are waiting, see below
}`;

const COLLECT = `let result = await sandbox.run({ code, functions, approval: { mode: 'collect' } });

while (result.status === 'pending') {
  // result.pending = [{ callId, seq, fn, input }, …] — none of them has run
  const decisions = await showCard(result.pending);   // { all: 'approve' } or { approve: [ids], reject: [ids] }
  result = await result.resume(decisions);
}`;

const PAUSE = `await sandbox.run({
  code, functions,
  approval: {
    mode: 'pause',
    onApproval: async ({ fn, input }) =>
      (await confirm(fn, input)) ? 'approve' : 'reject',
  },
});`;

const AI_SDK = `import { runCodeTool, clientTools } from '@faustine-ai/browser-sandbox/ai';

const runCode = runCodeTool({
  sandbox, functions,
  approval: { mode: 'collect', onApproval: showCard },
});

const tools = clientTools({ runCode, getLocation: () => geo.current() });
const chat = useChat({ transport, onToolCall: tools.onToolCall });
tools.attach(chat);`;

const CODEMODE = `import { asExecutor } from '@faustine-ai/browser-sandbox/codemode';

const codemode = createCodeTool({ tools, executor: asExecutor(sandbox) });`;

const TANSTACK = `import { asIsolateDriver } from '@faustine-ai/browser-sandbox/tanstack';

createCodeMode({ tools, driver: asIsolateDriver(sandbox) });`;

export default function Home() {
  return (
    <>
      <Nav />

      <main className="flex-1">
        {/* ══════════ Hero ══════════ */}
        <section className="relative overflow-hidden bg-aurora text-white">
          <Container className="relative pt-24 pb-8 text-center sm:pt-28 lg:pt-32">
            <div className="animate-rise">
              <Eyebrow tone="onDark" className="justify-center">
                @faustine-ai/browser-sandbox · MIT
              </Eyebrow>

              <h1 className="mx-auto mt-6 max-w-4xl text-balance text-[2rem] font-semibold leading-[1.06] tracking-[-0.035em] sm:text-[2.8rem] lg:text-[3.2rem]">
                Run agent-generated code in your web app, safely.
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-balance text-[1rem] leading-relaxed text-white/70 sm:text-[1.05rem]">
                A JavaScript library that runs model-written code in a Worker inside a sandboxed iframe. The code gets
                no network, no DOM and no storage: only the functions you define. Calls you mark wait for the user&apos;s
                approval before they run.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button href="/docs/getting-started/" variant="primary" size="lg">
                  Get started <ArrowRight />
                </Button>
                <Button href={LINKS.github} variant="ghostDark" size="lg" external>
                  <Icons.Github /> GitHub
                </Button>
              </div>

              <div className="mt-6">
                <InstallCommand />
              </div>
            </div>

            <div className="h-16 sm:h-28" />
          </Container>
        </section>

        {/* the diagram, straddling the seam */}
        <div className="bg-white">
          <Container className="relative -mt-12 pb-4 sm:-mt-24">
            <Architecture />
          </Container>
        </div>

        {/* ══════════ What it does ══════════ */}
        <section id="what" className="scroll-mt-20 bg-white py-16 sm:py-24">
          <Container>
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal>
                <SectionHead eyebrow="What it does" title="Code mode for the browser" />
                <div className="mt-6 space-y-4 text-[1rem] leading-relaxed text-zinc-600 sm:text-[1.05rem]">
                  <p>
                    In code mode the model does not call one tool per operation. It writes a small program that chains
                    the calls it needs, filters, loops, and returns one value. On the server this runs in a sandbox. In
                    the browser it has to run next to the user&apos;s session, because that is what the code works with:
                    the app&apos;s own client, the page the user is on.
                  </p>
                  <p>
                    This library is the place that code runs. You define the functions the model may call. The code runs
                    in an isolated worker and can call those functions and nothing else. Each function runs in your page,
                    with the session, and returns its value across the boundary. Functions you mark do not run until the
                    user approves them.
                  </p>
                </div>
              </Reveal>
              <Reveal delay={90}>
                <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/60 p-5 sm:p-6">
                  <p className="mono-label text-zinc-400">One turn</p>
                  <ol className="mt-4 space-y-3 text-[0.92rem] text-zinc-600">
                    {[
                      ["user", "“Cancel every open order over $100 from last week.”"],
                      ["model", "writes a function body: list the orders, filter them, cancel each one, return the ids"],
                      ["sandbox", "runs the body; orders.list runs in your page, orders.cancel is held for approval"],
                      ["user", "sees the three cancellations the code wants to make and approves them"],
                      ["model", "receives the ids and answers"],
                    ].map(([who, what], i) => (
                      <li key={i} className="flex gap-3">
                        <span className="mt-0.5 w-16 shrink-0 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-iris-600">{who}</span>
                        <span>{what}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </Reveal>
            </div>
          </Container>
        </section>

        {/* ══════════ Why not the page ══════════ */}
        <section id="why" className="scroll-mt-20 border-t border-zinc-100 bg-white py-16 sm:py-24">
          <Container>
            <Reveal>
              <SectionHead
                eyebrow="Why not run it in the page"
                title="Where the code runs decides what it can reach"
                body="A model that reads untrusted text writes the code. The question is what that code can touch while it runs."
              />
            </Reveal>

            {/* md+: one table with the facts and the consequence */}
            <Reveal className="mt-10 hidden md:block">
              <div className="overflow-x-auto rounded-2xl border border-zinc-200/80">
                <table className="w-full text-[0.9rem]">
                  <thead>
                    <tr className="bg-zinc-50">
                      <th className="mono-label px-4 py-3 text-left text-zinc-400">Where</th>
                      <th className="mono-label px-4 py-3 text-left text-zinc-400">Network</th>
                      <th className="mono-label px-4 py-3 text-left text-zinc-400">DOM, storage</th>
                      <th className="mono-label px-4 py-3 text-left text-zinc-400">Can be stopped</th>
                      <th className="mono-label px-4 py-3 text-left text-zinc-400">Consequence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {OPTIONS.map((o, i) => (
                      <tr key={o.t} className={`border-t border-zinc-100 align-top ${i === 2 ? "bg-iris-50/40" : ""}`}>
                        <td className="px-4 py-4">
                          <span className="block font-medium text-zinc-900">{o.t}</span>
                          <code className="mt-1 block font-mono text-[0.76rem] text-zinc-500">{o.code}</code>
                        </td>
                        <td className="px-4 py-4 text-zinc-700">{o.rows[0]}</td>
                        <td className="px-4 py-4 text-zinc-700">{o.rows[1]}</td>
                        <td className="px-4 py-4 text-zinc-700">{o.rows[2]}</td>
                        <td className="max-w-xs px-4 py-4 leading-relaxed text-zinc-600">{o.verdict}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>

            {/* phones: the same facts, one card per option */}
            <div className="mt-8 grid grid-cols-1 gap-4 md:hidden">
              {OPTIONS.map((o, i) => (
                <Reveal key={o.t} delay={i * 60}>
                  <div className={`rounded-2xl border p-5 ${i === 2 ? "border-iris-200 bg-iris-50/40" : "border-zinc-200/80 bg-white"}`}>
                    <p className="font-medium text-zinc-900">{o.t}</p>
                    <code className="mt-1 block font-mono text-[0.76rem] text-zinc-500">{o.code}</code>
                    <dl className="mt-3 space-y-1.5 text-[0.86rem]">
                      {[
                        ["Network", o.rows[0]],
                        ["DOM, storage", o.rows[1]],
                        ["Can be stopped", o.rows[2]],
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-3">
                          <dt className="w-28 shrink-0 text-zinc-400">{k}</dt>
                          <dd className="text-zinc-700">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 text-[0.9rem] leading-relaxed text-zinc-600">{o.verdict}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal className="mt-8">
              <p className="max-w-3xl text-[0.95rem] leading-relaxed text-zinc-600">
                A sandboxed iframe has an opaque origin: no cookies, no storage, same-origin with nobody. Its document
                carries a CSP with <code className="font-mono text-[0.86em] text-zinc-800">connect-src &apos;none&apos;</code>, and a
                Worker created inside it inherits that CSP, so the browser refuses the network before any code runs. The
                worker has no DOM and no navigable location, and <code className="font-mono text-[0.86em] text-zinc-800">terminate()</code>{" "}
                ends it at any point. Other approaches (SES, QuickJS in WebAssembly, an iframe without a worker) and why
                the library does not use them are in{" "}
                <a href="/docs/why/" className="font-medium text-iris-700 underline decoration-iris-300 underline-offset-2">
                  the docs
                </a>
                .
              </p>
            </Reveal>
          </Container>
        </section>

        {/* ══════════ How it works ══════════ */}
        <section id="how" className="scroll-mt-20 bg-ink py-16 text-white sm:py-24">
          <Container>
            <Reveal>
              <SectionHead
                tone="dark"
                eyebrow="How it works"
                title="Two calls"
                body="There is no server part. In srcdoc mode nothing is served; a page with a strict CSP serves one static document from a route instead."
              />
            </Reveal>

            <div className="mt-12 space-y-12">
              <Step n="01" t="Define the functions the code may call" b="defineFunctions is the only way a capability enters the sandbox. Each entry is the real function, which runs in your page, plus its policy. A dotted name becomes a path: the code calls sdk.orders.list(input). approval: true marks a function that needs the user's decision.">
                <Code code={DEFINE} title="page.ts" />
              </Step>
              <Step n="02" t="Run the code" b="The code runs as the body of an async function with sdk and console in scope. The result has one of five statuses and always carries the logs, the calls made and the timings. toToolOutput(result) turns it into what a chat tool returns to the model.">
                <Code code={RUN} title="page.ts" />
              </Step>
            </div>
          </Container>
        </section>

        {/* ══════════ Human in the loop ══════════ */}
        <section id="approval" className="scroll-mt-20 bg-white py-16 sm:py-24">
          <Container>
            <Reveal>
              <SectionHead
                eyebrow="Human in the loop"
                title="Marked functions run only after the user approves them"
                body="Approval is a property of the function, not of the prompt. A function with approval: true never runs by itself, whatever the code does. What happens when the code calls one depends on the mode you run with."
              />
            </Reveal>

            <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
              <Reveal>
                <div className="space-y-8">
                  <Mode name="deny" sub="the default">
                    The call throws <code className="font-mono text-[0.86em] text-zinc-800">ApprovalRejected</code> into the code
                    without running. Nothing marked runs by omission.
                  </Mode>
                  <Mode name="pause" sub="one decision per call">
                    The worker stops at the call and the run clock pauses while the user decides. <code className="font-mono text-[0.86em] text-zinc-800">approve</code>{" "}
                    runs it and returns the value; <code className="font-mono text-[0.86em] text-zinc-800">reject</code> throws at the call
                    site.
                    <div className="mt-3">
                      <Code code={PAUSE} />
                    </div>
                  </Mode>
                  <Mode name="collect" sub="one decision per batch">
                    A marked call does not run; the code receives a pending value and continues. Reads keep executing, marked
                    writes keep accumulating. The run is cut when the code observes a pending value or when it ends with calls
                    still pending. You get <code className="font-mono text-[0.86em] text-zinc-800">status: &quot;pending&quot;</code> and the
                    list of calls, with their names and arguments, to show the user. A loop of sixteen deletes is one card
                    with sixteen rows.
                    <div className="mt-3">
                      <Code code={COLLECT} />
                    </div>
                  </Mode>
                </div>
              </Reveal>

              <Reveal delay={90}>
                <div className="lg:sticky lg:top-24">
                  <p className="mono-label text-zinc-400">What the user decides on</p>
                  <div className="mt-3">
                    <ApprovalCard />
                  </div>
                  <p className="mt-3 text-[0.84rem] leading-relaxed text-zinc-500">
                    An example of what a host renders in its{" "}
                    <code className="font-mono text-[0.9em] text-zinc-700">onApproval</code> callback. The library hands you
                    the rows; the card, its wording and its buttons are yours, so the prompt looks like the rest of your app.
                  </p>
                  <ul className="mt-6 space-y-3 text-[0.92rem] leading-relaxed text-zinc-600">
                    <li className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-iris" />
                      <span>
                        The rows come from the sandbox, not from the model: the function name and the exact arguments of each
                        call the code tried to make.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-iris" />
                      <span>
                        <code className="font-mono text-[0.86em] text-zinc-800">resume</code> runs the same code again with a replay:
                        calls already made return their recorded result, approved calls execute, rejected calls throw. Nothing
                        runs twice.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-iris" />
                      <span>
                        If on resume the code tries a call that differs from what the user saw, the run ends with{" "}
                        <code className="font-mono text-[0.86em] text-zinc-800">ReplayMismatch</code> and nothing runs.
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-iris" />
                      <span>You can approve eight of sixteen. The rest throw at their call site.</span>
                    </li>
                  </ul>
                  <a href="/docs/approval/" className="mt-6 inline-flex items-center gap-1.5 text-[0.95rem] font-medium text-iris-700 hover:text-iris-900">
                    Approval in the docs <ArrowRight />
                  </a>
                </div>
              </Reveal>
            </div>
          </Container>
        </section>

        {/* ══════════ Security ══════════ */}
        <section id="security" className="scroll-mt-20 bg-zinc-50/70 py-16 sm:py-24">
          <Container>
            <Reveal>
              <SectionHead
                eyebrow="Security"
                title="What the sandbox enforces"
                body="Each of these is a browser guarantee or a check in the bridge, not a convention the code is asked to follow."
              />
            </Reveal>
            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SECURITY.map((f, i) => (
                <Reveal key={f.t} delay={(i % 3) * 60} className="h-full">
                  <div className="h-full rounded-2xl border border-zinc-200/80 bg-white p-5 sm:p-6">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-iris-50 text-iris-600 ring-1 ring-inset ring-iris-100">
                      <f.icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-[1rem] font-semibold tracking-[-0.015em] text-zinc-900">{f.t}</h3>
                    <p className="mt-2 text-[0.9rem] leading-relaxed text-zinc-600">{f.b}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-8">
              <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="text-[0.92rem] leading-relaxed text-zinc-600">
                  <p className="font-medium text-zinc-900">What it does not do</p>
                  <p className="mt-1">
                    It does not make your functions safe: what orders.cancel does with its input is your code&apos;s responsibility.
                    It is not a sandbox for your page. In srcdoc mode the frame inherits your page&apos;s CSP.
                  </p>
                </div>
                <Button href="/docs/security-model/" variant="ghostLight" className="shrink-0">
                  Security model <ArrowRight />
                </Button>
              </div>
            </Reveal>
          </Container>
        </section>

        {/* ══════════ Integrations ══════════ */}
        <section id="integrations" className="scroll-mt-20 bg-white py-16 sm:py-24">
          <Container>
            <Reveal>
              <SectionHead
                eyebrow="Integrations"
                title="Adapters for the AI SDK, Cloudflare codemode and TanStack AI"
                body="Faustine built this library for its own code mode in the browser. It fits a custom code mode like that one, the code mode libraries below, or any other system that has to run agent-generated code in the browser. The adapters are small and none of them is a runtime dependency."
              />
            </Reveal>
            <div className="mt-10 space-y-10">
              <Integration t="AI SDK" sub="useChat · onToolCall" code={AI_SDK} b="The AI SDK's own code mode runs on the server and reaches server tools only; runCode is the client-side piece, a client tool whose program runs in the user's browser against the page's functions. One entry in the map you build with clientTools next to your other client tools; the two code modes can combine in one chat." />
              <Integration t="Cloudflare codemode" sub="Executor" code={CODEMODE} b="createCodeTool delegates the run to an Executor. Its browser one is an iframe without a worker: it cannot stop a synchronous loop, needs 'unsafe-inline' and has no approval hook. asExecutor is a third executor for the same createCodeTool: a worker it can terminate, a strict CSP, the approval modes." />
              <Integration t="TanStack AI" sub="isolate driver" code={TANSTACK} b="createCodeMode runs the program through a pluggable IsolateDriver; the one it ships is QuickJS in WASM, with no approval step. asIsolateDriver is a driver for the same createCodeMode: the page's own engine, structured clone instead of re-encoding File and Blob, about 8 KB instead of a 1 MB payload, the approval modes." />
            </div>
            <Reveal className="mt-6">
              <a href="/docs/integrations/" className="inline-flex items-center gap-1.5 text-[0.95rem] font-medium text-iris-700 hover:text-iris-900">
                Integrations in the docs, with the server side <ArrowRight />
              </a>
            </Reveal>
          </Container>
        </section>

        {/* ══════════ Size, support, origin ══════════ */}
        <section className="border-t border-zinc-100 bg-white py-14 sm:py-16">
          <Container>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-14">
              <Reveal>
                <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-200/80">
                  {[
                    ["8.5 KB", "core, min+gz"],
                    ["0", "dependencies"],
                    ["2–7 ms", "boot"],
                  ].map(([n, l]) => (
                    <div key={l} className="bg-white px-4 py-4 sm:px-6">
                      <dd className="font-mono text-[1.3rem] font-medium tracking-[-0.02em] text-zinc-900 sm:text-[1.6rem]">{n}</dd>
                      <dt className="mono-label mt-1 text-zinc-400">{l}</dt>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[0.88rem] text-zinc-500">
                  Evergreen Chromium, Firefox and Safari 16+. A browser missing a primitive surfaces as SandboxUnavailable; there
                  is no degraded mode.
                </p>
              </Reveal>
              <Reveal delay={90}>
                <p className="text-[0.95rem] leading-relaxed text-zinc-600">
                  <a href={LINKS.faustine} target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2">
                    Faustine
                  </a>{" "}
                  builds this library for its Web App Agents, whose code mode runs on the customer&apos;s page. It has no
                  dependency on Faustine and is published under MIT so it can be read, tested and reused.
                </p>
              </Reveal>
            </div>
          </Container>
        </section>

        {/* ══════════ Install ══════════ */}
        <section className="bg-white pb-20 pt-2 sm:pb-24">
          <Container>
            <div className="relative overflow-hidden rounded-3xl bg-aurora px-5 py-12 text-center text-white sm:px-12 sm:py-16">
              <div className="relative mx-auto max-w-2xl">
                <h2 className="text-balance text-[1.7rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[2.4rem]">Install</h2>
                <p className="mx-auto mt-4 max-w-lg text-[1rem] leading-relaxed text-white/70">
                  One package, no server part. The five-minute example in the docs runs without serving anything.
                </p>
                <div className="mt-7">
                  <InstallCommand />
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button href="/docs/getting-started/" variant="primary" size="lg">
                    Get started <ArrowRight />
                  </Button>
                  <Button href={LINKS.npm} variant="ghostDark" size="lg" external>
                    <Icons.Npm /> npm
                  </Button>
                </div>
              </div>
            </div>
          </Container>
        </section>
      </main>

      <Footer />
    </>
  );
}

function Step({ n, t, b, children }: { n: string; t: string; b: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-12">
        <div>
          <span className="font-mono text-[0.78rem] text-iris-300">{n}</span>
          <h3 className="mt-2 text-[1.25rem] font-semibold tracking-[-0.025em] text-white">{t}</h3>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-white/60">{b}</p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </Reveal>
  );
}

function Mode({ name, sub, children }: { name: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5">
        <code className="rounded-md bg-iris-50 px-2 py-0.5 font-mono text-[0.9rem] font-medium text-iris-900">{name}</code>
        <span className="font-mono text-[0.72rem] text-zinc-400">{sub}</span>
      </div>
      <div className="mt-2.5 text-[0.95rem] leading-relaxed text-zinc-600">{children}</div>
    </div>
  );
}

function Integration({ t, sub, b, code }: { t: string; sub: string; b: string; code: string }) {
  return (
    <Reveal>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-12">
        <div>
          <div className="flex items-baseline gap-3">
            <h3 className="text-[1.2rem] font-semibold tracking-[-0.02em] text-zinc-900">{t}</h3>
            <span className="font-mono text-[0.72rem] text-zinc-400">{sub}</span>
          </div>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-zinc-600">{b}</p>
        </div>
        <div className="min-w-0">
          <Code code={code} title="page.ts" />
        </div>
      </div>
    </Reveal>
  );
}
