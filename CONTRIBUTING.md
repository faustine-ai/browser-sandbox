# Contributing

```sh
npm install
npx playwright install chromium firefox webkit   # once
npm run typecheck
npm test            # unit suite with coverage gates (node)
npm run test:browser  # builds, then Playwright in the three engines
npm run size        # bundle budgets
```

Layout:

```
src/core        createSandbox, the run engine (caps, clocks, approval, replay), errors, types
src/bridge      message types, sizes, canonical JSON
src/frame       the relay document and headers
src/worker      the worker runtime: hardening, function tree, console, pending sentinel
src/functions   defineFunctions, fromObject, describe
src/ai.ts, src/codemode.ts, src/tanstack.ts   adapters
test/unit       node tests; `inprocess.ts` runs the real worker runtime against the real host engine through a cloning fake port
test/browser    Playwright: runs, approval, limits, CSP hosts, escape attempts, timings
test/fixtures   the fixture server (three host pages, /sandbox) and the in-page harness
```

Rules:

- A change in `src/worker` or `src/frame` adds or updates an escape test.
- Coverage gates are in `vitest.config.ts`; keep them green rather than
  lowering them.
- No runtime dependencies. Adapters import types only.
- No fallback to the page realm, in any form, ever.
