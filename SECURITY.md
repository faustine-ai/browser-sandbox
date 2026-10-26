# Security

## What is claimed

The claims are the rows of the table in the README's *Security model*
section. Each row is one or more tests in `test/browser/escape.spec.ts` and
`test/browser/runs.spec.ts`, run in Chromium, Firefox and WebKit in CI on
every change. A claim without a test is not made.

In one paragraph: code given to `sandbox.run` executes in a dedicated
Worker inside an `<iframe sandbox="allow-scripts">` whose document carries
a Content Security Policy with `default-src 'none'` and `connect-src
'none'`. The worker inherits that policy, has no DOM and no navigable
location, and reaches the page only through one `MessagePort` that accepts
the message types the library defines. The page executes only functions
named in the map it was given, enforces the caps, and can terminate the
worker at any time.

## What is not claimed

- The safety of the functions you expose. The sandbox decides *whether* a
  function is called and *with what*; what the function then does is your
  code.
- Protection of your page from itself. The library runs in your page with
  your page's trust.
- `srcdoc` mode on a page with a Content Security Policy: the frame
  inherits it. The README says what that needs.
- Resistance to a compromised browser or extension.
- Side channels: the code can measure time.

## Policy

- **No fallback.** No version of this library will ever run code in the
  page realm when the sandbox cannot start. A `SandboxUnavailable` result
  is the whole answer.
- **Escape tests are the changelog.** A fix for an escape adds a test
  named after the attempt. Pull requests that touch `src/worker` or
  `src/frame` add or update one.
- **Supported versions:** the latest minor.

## Reporting

Email security@faustine.ai with the attempt (the code you ran, the browser
and version, what you observed). Please do not open a public issue for an
escape until a fix is published. We answer within three working days and
credit reporters in the changelog unless they prefer not to be named.
