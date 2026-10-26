# @faustine-ai/browser-sandbox

Run model-written JavaScript in the browser, in a dedicated Worker inside an
opaque-origin `<iframe sandbox>`: no network, no DOM, no storage, only the
functions you hand it, called over a private `MessageChannel`. Marked
functions can be held for a human before they run. A busy loop is stopped
with `terminate()`, not hoped away.

Work in progress. The full documentation lands with 0.1.0.
