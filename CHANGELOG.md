# Changelog

## 0.1.1 — 2026-10-31

- `collect` mode: returning a pending value from the code, alone or nested
  in an array, object, Map or Set, now ends the pass as `pending` (it is an
  observation, like a property read). It used to fail the run with
  `CloneError` when the result was posted back. Found on the try-out page.
- Site: a try-out page at `/try/` runs the published package in the browser
  with editable functions and code, the three approval modes, live console
  and calls. Linked from the README.

## 0.1.0 — unreleased

- `createSandbox` with `url` and `srcdoc` frame modes; a private
  `MessageChannel` bridge with a one-`init` handshake; the worker runtime
  with a hardened scope, a function tree, console capture and the pending
  sentinel; caps (`timeoutMs`, `busyMs`, `maxOps`, `maxInputBytes`,
  `maxOutputBytes`, log caps); `deny` / `pause` / `collect` approval with
  `resume` and a deterministic replay; `defineFunctions`, `fromObject`,
  `describe`, `toToolOutput`; `frameDocument` / `frameHeaders` with a
  hashed script.
- Adapters: AI SDK (`runCodeTool`, `clientTools`, `fromTools`), Cloudflare
  codemode (`asExecutor`), TanStack AI (`asIsolateDriver`).
- Unit suite with coverage gates; Playwright suite in Chromium, Firefox and
  WebKit including the escape attempts.
