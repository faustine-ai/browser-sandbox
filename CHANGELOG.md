# Changelog

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
