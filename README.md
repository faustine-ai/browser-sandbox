# @faustine-ai/browser-sandbox

Run model-written JavaScript in the browser, in a dedicated Worker inside an
opaque-origin `<iframe sandbox>`: **no network, no DOM, no storage, only the
functions you hand it**, called over a private `MessageChannel`. Functions
you mark can be held for a human before they run. A busy loop is stopped
with `terminate()`, not hoped away.

```
your page                                    sandbox frame (origin "null")
┌─────────────────────────────────────┐      ┌───────────────────────────────────────┐
│ functions = defineFunctions({ … })  │      │ CSP: default-src 'none';              │
│   run here, with your session,      │      │      connect-src 'none';              │
│   your router, your storage         │◀─MC──┼─▶   worker-src blob:                  │
│                                     │      │  ┌ Worker ─────────────────────────┐  │
│ sandbox.run({ code, functions })    │      │  │ sdk.orders.list(input) → "call" │  │
│   → { status, value | error | … }   │      │  │ ES builtins, timers, console    │  │
└─────────────────────────────────────┘      │  │ no fetch / XHR / WS / DOM       │  │
                                             │  └─────────────────────────────────┘  │
                                             └───────────────────────────────────────┘
```

- **One door.** The code sees a tree of the names you defined and nothing
  else. A name outside the map runs nothing.
- **Structured clone only.** `File` and `Blob` cross; functions, DOM nodes
  and class instances do not.
- **Approval at the bridge.** Mark a function `approval: true` and decide
  per call (`pause`) or per batch after the run was cut (`collect`), with a
  deterministic replay. The model cannot skip it.
- **Real limits.** Wall clock, a busy-loop watchdog, calls per run, input
  and output bytes, log lines. Expiry terminates the worker.
- **Fits the AI SDK, Cloudflare `codemode` and TanStack AI** through small
  adapters; no runtime dependency on any of them.
- **8.5 KB** min+gz for the core, 2.4 KB for the worker runtime, 0.5 KB for
  the frame relay. No dependencies.

Tested in Chromium, Firefox and WebKit on every change, including a suite
of escape attempts that must all fail (see [Security model](#security-model)).

Try it without installing anything: <https://browser-sandbox.faustine.ai/try/>
runs this package in your browser, with editable functions and code.

## Contents

1. [Why a frame and a worker](#why-a-frame-and-a-worker)
2. [Install and a five-minute example](#install-and-a-five-minute-example)
3. [Frame modes: `srcdoc` and `url`](#frame-modes-srcdoc-and-url)
4. [Functions](#functions)
5. [Running code](#running-code)
6. [Approval](#approval)
7. [Limits and cancellation](#limits-and-cancellation)
8. [Integrations](#integrations)
9. [What crosses the boundary](#what-crosses-the-boundary)
10. [Security model](#security-model)
11. [Browser support, size, versioning](#browser-support-size-versioning)
12. [API reference](#api-reference)
13. [FAQ](#faq)

## Why a frame and a worker

The code a model writes has to run somewhere with the user's session, or it
cannot do anything useful. Running it in your page with `new Function` gives
it everything your page has: `fetch` with cookies, `localStorage`, the DOM,
every global. Any text the model reads can then run script on your origin.

The alternatives, and why this library does not use them:

- **A Worker created from your page.** It has no DOM, but it is same-origin
  with your page: `fetch` inside it carries the user's cookies, and your CSP
  needs `worker-src blob:`.
- **SES / `lockdown` + `Compartment`.** A Compartment without `lockdown` is
  not a boundary; with it, your page's intrinsics are frozen, which breaks
  most apps. Fine as a hardening layer, not as the boundary.
- **QuickJS in WASM.** A real separate engine with its own memory and an
  interrupt handler. Costs a ~1 MB payload, a different JavaScript engine
  from the page's, and re-encoding `File`/`Blob` by hand.
- **An iframe alone.** A sandboxed frame has no cookies, but its window can
  still navigate (`location = "https://…?" + data`), and a synchronous loop
  cannot be stopped from outside.

A `<iframe sandbox="allow-scripts">` has an **opaque origin**: no cookies,
no storage, same-origin with nobody. Its document carries a CSP with
`connect-src 'none'`, and a Worker created from a `blob:` inside it
**inherits that CSP**: `fetch`, `XMLHttpRequest`, `WebSocket`,
`EventSource`, `sendBeacon`, `importScripts` and dynamic `import()` are all
refused by the browser before any code of ours runs. The worker has no DOM
and no navigable `location`, and `terminate()` ends a `while (true) {}`
mid-loop. The library adds a prelude that removes the same globals (so a
failure reads `fetch is not defined`), a bridge that only accepts the
message types it defines, and caps on the host side.

## Install and a five-minute example

```sh
npm install @faustine-ai/browser-sandbox
```

Everything runs in the browser; there is no server part. The quickest
start uses `srcdoc` mode, which needs nothing served:

```ts
import { createSandbox, defineFunctions } from '@faustine-ai/browser-sandbox';

const sandbox = createSandbox({ frame: { srcdoc: true }, warm: true });

const functions = defineFunctions({
  'orders.list':   (input) => api.orders.list(input),
  'orders.cancel': { call: (input) => api.orders.cancel(input), approval: true },
});

const result = await sandbox.run({
  code: `
    const open = await sdk.orders.list({ status: "open" });
    return open.filter(o => o.total > 100).map(o => o.id);
  `,
  functions,
});

if (result.status === 'ok') console.log(result.value);
```

The code runs as the body of an `async` function with `sdk` (the function
tree) and `console` in scope. `return` and `await` work as in any function.

## Frame modes: `srcdoc` and `url`

What matters in the frame document is its **CSP**, because the worker
inherits it. The `frame` option says where that document comes from.

### `srcdoc`: no server

```ts
createSandbox({ frame: { srcdoc: true } });
```

The library writes the document inline. Its `<meta>` CSP applies (policies
intersect, so even if your page allows `connect-src` to your API, nothing
inside the frame can reach it). The catch: **a `srcdoc` document also
inherits your page's CSP in full.** So:

- No CSP on your page: works.
- A CSP with `'unsafe-inline'` or `'unsafe-eval'` missing from `script-src`,
  or a nonce-only `script-src`: the frame cannot boot. `run` resolves
  `SandboxUnavailable`; nothing falls back to your page.
- A CSP that does allow inline scripts and eval but has no `worker-src blob:`
  (or `child-src blob:`): the frame boots but the worker cannot start;
  `run` resolves `SandboxUnavailable` with that cause.

### `url`: a static document you serve

```ts
createSandbox({ frame: { url: '/sandbox' } });
```

The same document, served over HTTP with its own headers. Its CSP comes
from the header and inherits nothing from your page, so it works on pages
with a strict CSP. Your page needs one line: `frame-src` to wherever you
serve it (`'self'` if it is on your origin). The document is static and
cacheable (`immutable`); the library appends `?v=<hash>` and checks the
protocol version in the handshake.

Serving it:

```ts
// Next.js: app/sandbox/route.ts
import { frameDocument, frameHeaders } from '@faustine-ai/browser-sandbox/frame';
export function GET() {
  return new Response(frameDocument(), { headers: frameHeaders() });
}
```

```ts
// Express
import { frameDocument, frameHeaders } from '@faustine-ai/browser-sandbox/frame';
app.get('/sandbox', (_req, res) => res.set(frameHeaders()).send(frameDocument()));
```

```sh
# A static file: write it once at build time…
node -e "import('@faustine-ai/browser-sandbox/frame').then(m => process.stdout.write(m.frameDocument()))" > public/sandbox.html
```

```nginx
# …and serve it with the headers (nginx)
location = /sandbox.html {
  add_header Content-Security-Policy "default-src 'none'; connect-src 'none'; img-src 'none'; script-src 'sha256-<hash>' 'unsafe-eval'; worker-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors *" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy no-referrer always;
  add_header Cache-Control "public, max-age=31536000, immutable" always;
}
```

The exact header values, including the hash, are what `frameHeaders()`
returns; print them once rather than copying from here. `'unsafe-eval'`
is required by the worker's `AsyncFunction` and is harmless in a document
that has no network and no origin.

| | `srcdoc` | `url` |
|---|---|---|
| Install | `npm i` | `npm i` + one static route |
| Network blocked inside | yes (`<meta>` CSP) | yes (header CSP) |
| Page without a CSP | works | works |
| Page with a strict CSP | `SandboxUnavailable` | works, add `frame-src` |
| Page with a lax CSP | needs `worker-src blob:` | works |
| Cache / version | n/a | immutable, `?v=`, checked in the handshake |

The library never falls from one mode to the other on its own.

## Functions

`defineFunctions` is the only way a capability enters the sandbox. Each
entry is the real function, which runs in your page, plus its policy.

```ts
import { defineFunctions, fromObject, describe } from '@faustine-ai/browser-sandbox';

const functions = defineFunctions({
  'orders.list':   (input) => api.orders.list(input),                   // plain
  'orders.cancel': { call: (input) => api.orders.cancel(input),          // with a policy
                     approval: true, description: 'Cancels an order' },
  'util.sum':      { call: (...nums) => nums.reduce((a, b) => a + b, 0),
                     positional: true },                                 // code calls sum(1, 2, 3)
  help:            (topic) => docs.lookup(topic),
});
```

- A **dotted name** becomes a path in the tree: `sdk.orders.list(input)`.
  Segments are identifiers; `__proto__`, `constructor` and `prototype` are
  refused.
- A function receives **one argument** (whatever the code passed) unless
  `positional: true`, in which case it receives the arguments spread.
- A name can be both a leaf and a branch (`help` and `help.topics`): it is
  a function with properties.
- `approval: true` holds the call for a human (see [Approval](#approval)).
- `description` and `input` (a JSON Schema) are used only by `describe`.

`fromObject` builds the map from an existing object by **listing** names,
never by enumerating the object:

```ts
const functions = fromObject(client, {
  names: ['orders.list', 'orders.cancel', 'customers.get'],
  approval: (name) => name.endsWith('.cancel'),
  descriptions: (name) => catalog[name]?.summary,
  extra: { help: (topic) => docs.lookup(topic) },
});
```

Paths are resolved at call time with the right `this`, so lazily built
clients work; a missing path throws `UnknownFunction` into the code.

For the system prompt, `describe` prints the names exactly as the code will
use them:

```ts
describe(functions);                       // - sdk.orders.list(input)
                                           // - sdk.orders.cancel(input) (requires approval) — Cancels an order
describe(functions, { format: 'ts' });     // declare const sdk: { orders: { list(input?: unknown): Promise<unknown>; … } };
```

## Running code

```ts
const result = await sandbox.run({
  code,                                  // the body of an async function
  functions,
  scope: {
    root: 'sdk',                         // name of the tree inside the code (default)
    values: { files, user },             // cloned in, exposed as `files`, `user`
    spread: false,                       // true: top-level functions also as bare identifiers
  },
  approval: { mode: 'deny' },            // see Approval
  caps: { timeoutMs: 30_000 },           // per-run override of the sandbox caps
  signal: controller.signal,             // cancel → status "aborted"
  onLog:  (line) => ui.append(line),     // console output, live
  onCall: (record) => audit.push(record) // every function call
});
```

`result.status` is one of five, and every result carries `logs`, `calls`
and `stats`:

```ts
switch (result.status) {
  case 'ok':      result.value;                       // what the code returned (undefined → null)
  case 'error':   result.error;                       // { name, message, line? } — thrown by the code or a SyntaxError
  case 'limit':   result.limit; result.error.message; // "timeout" | "busy" | "ops" | "output" | "input" | "crash"
  case 'aborted':                                     // the signal fired
  case 'pending': result.pending; result.resume;      // collect mode, see Approval
}
result.logs;   // [{ level, text, at }]
result.calls;  // [{ seq, fn, input, ok, ms, decision?, error? }]
result.stats;  // { ms, opsUsed, logsDropped }
```

Error names you can match: `SandboxUnavailable` (the frame or the worker
could not start), `ApprovalRejected`, `UnknownFunction`, `CloneError`,
`SandboxLimit`, `ReplayMismatch`, `BadDecision`, `InvalidRun`.

`toToolOutput(result)` maps a result to what a chat tool usually returns,
worded for a model:

```ts
toToolOutput(result);
// { ok: true, result, logs? }
// { ok: false, error: "TypeError: x is not a function (line 3)" }
// { ok: false, error: "Denied (sandbox_limit): more than 200 function calls in one run" }
// { ok: false, error: "Paused: 3 operations in this code need the user's approval and were NOT run. …" }
```

Runs on one sandbox are queued; create more sandboxes for parallel runs.
With `workerPerRun: true` (the default) nothing survives from one run to
the next.

## Approval

A function with `approval: true` never runs by itself. What happens when
the code calls one depends on the run's `approval` option.

### `deny` (default)

The call throws `ApprovalRejected` into the code without running. Nothing
marked ever runs by omission.

### `pause`: one decision per call, the run waits

```ts
await sandbox.run({
  code, functions,
  approval: {
    mode: 'pause',
    onApproval: async ({ fn, input, seq }) => (await confirmDialog(`${fn}`, input)) ? 'approve' : 'reject',
  },
});
```

The worker waits on the call; the run clock pauses while the human decides;
`approve` runs it and returns the value, `reject` throws `ApprovalRejected`
at the call site. Uncaught, the run ends with that error.

### `collect`: one decision per batch, after the run was cut

```ts
let result = await sandbox.run({ code, functions, approval: { mode: 'collect' } });

while (result.status === 'pending') {
  // one card, N rows: result.pending = [{ callId, seq, fn, input }, …]
  const decisions = await showBatchCard(result.pending);   // { all: 'approve' } | { approve: [ids], reject: [ids] }
  result = await result.resume(decisions);
}
```

A marked call does not run; the code receives a **pending value** instead
and goes on. Reads keep executing, writes keep accumulating. The run is cut
at the first **observation** of a pending value (a property read, a
coercion, a spread, `JSON.stringify`, a call) or at the **end of the pass**
with calls still pending. `resume` re-runs the same code with a replay:
calls already made return their recorded result without executing again,
approved ones execute, rejected ones throw `ApprovalRejected`. A call that
differs from what was shown ends the run with `ReplayMismatch`, and nothing
runs. In `collect` mode calls are serialised in creation order so the
replay is deterministic (a `Promise.all` still works, queued).

A loop of sixteen deletes is therefore one card with sixteen rows. A second
card happens only when the code needed the result of a marked call to
continue and then reached another marked call.

With a batch hook the library owns the loop and `run` never resolves
`pending`:

```ts
await sandbox.run({
  code, functions,
  approval: { mode: 'collect', onApproval: (pending) => showBatchCard(pending) },
});
```

The two hooks differ on purpose: `pause` decides one call with a string
while the worker waits; `collect` decides a batch with `Decisions` after the
run was cut, and you can approve eight of sixteen.

## Limits and cancellation

```ts
createSandbox({
  frame: { url: '/sandbox' },
  caps: {
    timeoutMs: 60_000,          // wall clock of the run; pauses while a human decides
    busyMs: 10_000,             // longest the code may run with no function call in flight
    maxOps: 200,                // function calls per run
    maxOutputBytes: 1_000_000,  // the run value and each call result
    maxInputBytes: 1_000_000,   // each call input
    maxLogLines: 200,           // console lines kept; the rest counted in stats.logsDropped
    maxLogChars: 262_144,
  },
});
```

These are the defaults. Two clocks: `timeoutMs` bounds the whole run (time
inside your functions counts, since a hung endpoint must still end the
run; time waiting for a human does not); `busyMs` bounds how long the
worker may run with nothing outstanding, which is what ends `while (true)`
in seconds without starving a run that chains slow calls. Any limit
terminates the worker and resolves `status: "limit"`; the message is
worded for a model.

An `AbortSignal` in `run` resolves `status: "aborted"` and terminates the
worker, mid-loop if need be.

## Integrations

Faustine built this library for its own code mode in the browser, where
the agent's program runs on the customer's page. It is meant for custom
code mode implementations like that one, for the code mode libraries
below, and for any other system, agentic loop or not, that has to run
agent-generated code in the browser.

### AI SDK (`useChat`, `Chat`)

The AI SDK has one `onToolCall` per chat and answers through
`addToolOutput`. The sandbox's tool is one entry in a map you build here;
the rest of your client tools keep working.

```ts
import { createSandbox, defineFunctions } from '@faustine-ai/browser-sandbox';
import { runCodeTool, clientTools, fromTools } from '@faustine-ai/browser-sandbox/ai';

const sandbox = createSandbox({ frame: { url: '/sandbox' }, warm: true });

const functions = defineFunctions({
  ...fromTools(myClientTools, { namespace: 'app' }),        // AI SDK tools with `execute` → sdk.app.<name>
  'orders.list':   (input) => api.orders.list(input),
  'orders.cancel': { call: (input) => api.orders.cancel(input), approval: true },
});

const runCode = runCodeTool({
  sandbox, functions,
  approval: { mode: 'collect', onApproval: (pending) => showBatchCard(pending) },
});

const tools = clientTools({
  runCode,                                                  // the sandbox's tool (name "runCode")
  getLocation: async () => geo.current(),                   // your own client tools
  confirmPayment: 'external',                               // answered later by your UI
});

const chat = useChat({ transport, onToolCall: tools.onToolCall });
tools.attach(chat);                                         // hands the helper addToolOutput
```

- Dispatch is by `toolCall.toolName`. A plain function runs and its value
  goes to `addToolOutput`; `'external'` is left alone for your UI; an
  unknown name is logged and never answered. Dynamic tools dispatch by
  name too.
- Outputs produced before `attach` are delivered when you attach.
- With your own `onToolCall`, skip `clientTools` and call
  `runCode.handle(toolCall)` from your `switch`.
- `fromTools` maps `needsApproval: true` to `approval: true`; inside the
  sandbox the run's approval mode governs it.

On the server, `runCode` is a tool without `execute` (the client answers):

```ts
tools: {
  runCode: tool({
    description: 'Runs JavaScript in the user\'s browser against `sdk`. Return the value you need.',
    inputSchema: z.object({ code: z.string() }),
  }),
}
```

Put `describe(functions)` in the system prompt so the model writes the
names the code will find.

**Isn't code mode already in the AI SDK?** On the server. The program of
`@ai-sdk/code-mode` runs in QuickJS inside a Node worker, "is not
available in browser or edge runtimes", and reaches server tools only. In
the browser the AI SDK gives you client tools and nothing that runs a
program against them; `runCode` is that piece. The two can combine in one
chat: server tools behind `code_mode`, page functions behind `runCode`.

### Cloudflare `@cloudflare/codemode`

Cloudflare's `createCodeTool` owns the prompt and the tool wiring and
delegates the run to an `Executor`. It ships two: Dynamic Workers on the
server, and `IframeSandboxExecutor` for the browser, an iframe without a
worker, which cannot stop a synchronous loop (documented, 30 s timeout),
needs `'unsafe-inline'` in its CSP and has no approval hook.
`asExecutor(sandbox)` is a third executor for the same `createCodeTool`:
a worker it can terminate, a frame that works under a strict CSP, and the
approval modes. Their server executor stays for server tools.

```ts
import { asExecutor } from '@faustine-ai/browser-sandbox/codemode';

const executor = asExecutor(sandbox);                        // Executor { execute(code, fns) }
const codemode = createCodeTool({ tools, executor });
```

A plain record of functions is exposed as `codemode.<name>(...args)`;
providers as `codemode.<provider>.<fn>`. `asExecutor(sandbox, { root,
needsApproval, approval, caps })` for the policies.

### TanStack AI

TanStack's `createCodeMode` writes the prompt and compiles the bindings;
the program runs through a pluggable `IsolateDriver`, and the driver it
ships is QuickJS compiled to WASM, with no approval step.
`asIsolateDriver(sandbox)` is a driver for the same `createCodeMode`: the
page's own engine instead of a second one, structured clone instead of
re-encoding `File` and `Blob` by hand, about 8 KB instead of a 1 MB WASM
payload, and the approval modes. Their QuickJS driver stays the choice on
the server or when you want an engine separate from the page's.

```ts
import { asIsolateDriver } from '@faustine-ai/browser-sandbox/tanstack';

createCodeMode({ tools, driver: asIsolateDriver(sandbox) });
```

Bindings become bare `external_<name>(input)` functions, as TanStack's
generated code expects. `createContext({ timeout })` maps to `timeoutMs`.

## What crosses the boundary

Everything between your page and the worker travels by **structured
clone** through a `MessageChannel`. That decides what can and cannot pass:

| Passes | Fails (on the side that tries) |
|---|---|
| JSON values, `Date`, `RegExp`, `Map`, `Set`, typed arrays, `BigInt` | functions and closures |
| `File`, `Blob` (by reference to the same bytes, no copy) | DOM nodes, `Window`, `Response` |
| `ArrayBuffer` (copied) | class instances (arrive as plain objects, methods gone) |
| plain objects and arrays, nested | `Proxy`, `WeakMap`, `SharedArrayBuffer` |

A function returning something unclonable makes that call reject with
`CloneError`; a run returning one ends with `CloneError`. Nothing crosses
partially.

## Security model

Every row is one or more tests in `test/browser/escape.spec.ts`, run in
Chromium, Firefox and WebKit on every change. The list is the contract; a
claim without a test is not made.

| Claim | What the tests do |
|---|---|
| No network from the code | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts`, dynamic `import()`, nested `Worker` / `SharedWorker`, `WebTransport`, `fetch` reached through the prototype chain, `new Function("return fetch")`, indirect `eval`: each ends as an error, and the fixture server never receives a request. |
| No DOM, no host page | `window`, `document`, `parent`, `localStorage`, `indexedDB`, `caches`, `BroadcastChannel` are undefined; `location` is gone, assigning it creates a property and navigates nothing. |
| Only named functions run | A call outside the map runs nothing on the host; the tree has no `constructor` and a `null` prototype; function sources are the few-byte wrappers. |
| Nothing but clone crosses | A function or a Proxy in a value → `CloneError`; `File` / `Blob` arrive intact. |
| The channel is private | The code cannot reach the port (`typeof port`, the own properties of `self`); `self.postMessage` reaches a frame that does not listen; the frame accepts one `init` from its parent and ignores messages without the nonce; the page accepts the handshake only from the frame it created. |
| Loops stop | `while (true) {}`, a never-resolving promise, memory growth: the run ends at the watchdog or the clock, the worker is gone, the page stayed responsive; `signal.abort()` ends a run in flight. |
| Caps hold | 21 calls under `maxOps: 20` → the 21st ends the run; a 2 KB value under `maxOutputBytes: 1000` never arrives; a 2 KB input is refused; 500 log lines under `maxLogLines: 50` keep 50 and count 450. |
| Approval cannot be skipped | A marked function under `deny` never runs; under `pause` it runs only after `approve`; under `collect` it is deferred, observation cuts the run, `resume` replays recorded results without re-executing, and a call that differs from the approved one is `ReplayMismatch`. |
| Isolation between runs | A global set in one run is `undefined` in the next. |
| Host CSP | `url` mode boots on a page with `script-src 'nonce-…'` and no `'unsafe-eval'`; `srcdoc` on that page is `SandboxUnavailable`; on a page whose CSP has no `worker-src blob:`, `srcdoc` is `SandboxUnavailable` with the cause and `url` works. |
| No fallback | A frame that cannot load (404) is `SandboxUnavailable`; nothing is compiled in the page. |

What the sandbox does **not** do:

- It does not make your functions safe. Whatever `orders.cancel` does with
  the input it receives is your code's responsibility; the sandbox only
  guarantees the code can call nothing else and that marked calls wait for
  a human.
- It is not a DOM sandbox for your page. Your page is as trusted as it
  always was; the library runs in it.
- `srcdoc` mode inherits your page's CSP (see [Frame modes](#frame-modes-srcdoc-and-url)).
- It does not hide timing: the code can measure how long a function takes.

Found a hole? See [SECURITY.md](SECURITY.md).

## Browser support, size, versioning

Evergreen Chromium, Firefox and Safari 16+. The suite runs in Playwright's
Chromium, Firefox and WebKit. A browser missing a primitive (sandboxed
frames, `MessageChannel`, `blob:` workers, worker CSP inheritance) surfaces
as `SandboxUnavailable`; there is no degraded mode.

Sizes, min+gz, checked in CI against budgets: core 8.5 KB (budget 10),
worker runtime 2.4 KB (budget 4), frame relay 0.5 KB (budget 2).

The frame document carries a protocol version; the page checks it in the
handshake and refuses a mismatch. The worker runtime is **sent by the page**
in the `spawn` message, so the frame document rarely changes and a stale
cached copy keeps working across library versions until the protocol
itself changes. `frameVersion()` is a short hash to use as a cache key.

Timings on a laptop (local server): boot 2–7 ms, first run 3–5 ms, bridge
overhead per call ≤ 0.1 ms, a 1 MB string in and out 3–8 ms, a 5 MB `File`
in 3–5 ms.

## API reference

### `createSandbox(options): Sandbox`

| Option | Type | Default | |
|---|---|---|---|
| `frame` | `{ url: string }` \| `{ srcdoc: true }` | required | Where the frame document comes from. |
| `caps` | `Partial<Caps>` | see [Limits](#limits-and-cancellation) | Defaults for every run. |
| `warm` | `boolean` | `false` | Boot the frame now instead of on the first run. |
| `workerPerRun` | `boolean` | `true` | A fresh worker per run; `false` reuses one. |
| `bootTimeoutMs` | `number` | `10000` | Handshake and spawn timeout before `SandboxUnavailable`. |
| `container` | `Element` | `document.body` | Where the frame element is appended. |

`Sandbox`: `state` (`idle` \| `booting` \| `ready` \| `failed` \| `disposed`),
`ready: Promise<void>` (rejects with `SandboxUnavailable`), `run(options):
Promise<RunResult>`, `dispose()`.

### `sandbox.run(options): Promise<RunResult>`

| Option | Type | |
|---|---|---|
| `code` | `string` | The body of an async function. |
| `functions` | `FunctionMap` | From `defineFunctions` / `fromObject`. |
| `scope.root` | `string` | Name of the tree. Default `sdk`. |
| `scope.values` | `Record<string, unknown>` | Cloned in, exposed by name. Keys must be identifiers; `console` and the root name are reserved. |
| `scope.spread` | `boolean` | Also expose top-level functions as bare identifiers. |
| `approval` | `{ mode: 'deny' }` \| `{ mode: 'pause', onApproval }` \| `{ mode: 'collect', onApproval? }` | Default `deny`. |
| `caps` | `Partial<Caps>` | Per-run override. |
| `signal` | `AbortSignal` | Cancel. |
| `onLog` | `(line: LogLine) => void` | Console output, live. |
| `onCall` | `(record: CallRecord) => void` | Every call, after it was answered. |

`RunResult` is the union in [Running code](#running-code).

### Functions

- `defineFunctions(defs)`: `Record<string, FunctionImpl | FunctionEntry>` → frozen `FunctionMap`.
  `FunctionEntry = { call, approval?, positional?, description?, input? }`.
- `fromObject(object, { names, approval?, descriptions?, extra? })`.
- `isFunctionName(name)`.
- `describe(functions, { root?, format?: 'index' | 'ts' })`.

### Output

- `toToolOutput(result)` → `{ ok: true, result, logs? } | { ok: false, error, logs? }`.

### Frame (`@faustine-ai/browser-sandbox/frame`, also on the main entry)

- `frameDocument()`: the HTML.
- `frameHeaders()`: the headers to serve it with.
- `FRAME_CSP`, `FRAME_PROTOCOL_VERSION`, `frameVersion()`.

### Adapters

- `/ai`: `runCodeTool(options)`, `clientTools(map, options?)`, `fromTools(tools, options?)`.
- `/codemode`: `asExecutor(sandbox, options?)`, `toExecuteResult(result)`.
- `/tanstack`: `asIsolateDriver(sandbox, options?)`, `toExecutionResult(result)`.

### Types

`Caps`, `SandboxOptions`, `RunOptions`, `RunResult`, `LogLine`, `CallRecord`,
`PendingCall`, `Decisions`, `ApprovalOptions`, `OnCallApproval`,
`OnBatchApproval`, `LimitKind`, `FunctionMap`, `FunctionEntry`,
`SandboxError` (with `name: SandboxErrorName`).

## FAQ

**My page has a strict CSP. What do I need?** `url` mode and one
`frame-src` entry for the origin that serves the document. Nothing else:
no `'unsafe-eval'`, no `worker-src`.

**Can I run it on Safari?** Yes; the suite runs in WebKit. Safari 16+.

**Several sandboxes?** As many as you like; each has its own frame and
queue. Runs on one sandbox are sequential.

**Should I reuse workers?** `workerPerRun: false` saves a few milliseconds
per run and keeps whatever the previous run left in the worker's global.
Use it only when runs trust each other.

**How do I read the logs?** `result.logs`, or live through `onLog`.
`toToolOutput` includes them as `logs` for the model.

**Can I debug the worker in devtools?** Yes: it appears as a dedicated
worker under the sandbox frame; the model's code is the body of the
compiled function.

**Why is there no fallback to `new Function` in the page?** Because a
fallback is the hole. If the sandbox cannot start, tell the model, do not
run the code.

**Does `pause` time out?** The run clock pauses while `onApproval` is
pending. Cut a stale wait with the run's `signal`.

**What does the model see when a limit hits?** `toToolOutput` words it:
`Denied (sandbox_limit): the code ran 10000 ms with no function call in flight`.

## License

MIT. Built by [Faustine](https://faustine.ai) for its Web Agents and
published so it can be reviewed and reused.
