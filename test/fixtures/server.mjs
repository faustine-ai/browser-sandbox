// Fixture server for the browser suite: three host pages (no CSP, strict
// CSP, lax CSP), the built library, the harness, and /sandbox served with
// frameHeaders(). Every request is logged so a test can prove nothing
// reached /exfil.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { frameDocument, frameHeaders } from '../../dist/frame.js';

const PORT = 4173;
const NONCE = 'test-nonce-123';
const lib = readFileSync(new URL('../../dist/index.js', import.meta.url));
const harness = readFileSync(new URL('./harness.js', import.meta.url));
const requests = [];

const page = (title) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>` +
  `<script type="module" nonce="${NONCE}" src="/harness.js"></script></body></html>`;

const CSP = {
  strict: `default-src 'none'; script-src 'self' 'nonce-${NONCE}'; connect-src 'self'; frame-src 'self'; worker-src 'none'; style-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'`,
  lax: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src blob:; frame-src 'self'; connect-src *`,
  // A lax host that never allowed blob: workers: srcdoc mode inherits it and must fail clean.
  laxNoBlob: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; frame-src 'self'; connect-src *`,
};

createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  requests.push(url.pathname + url.search);
  const send = (status, body, headers) => {
    res.writeHead(status, headers);
    res.end(body);
  };
  switch (url.pathname) {
    case '/healthz':
      return send(200, 'ok', { 'Content-Type': 'text/plain' });
    case '/__requests':
      return send(200, JSON.stringify(requests), { 'Content-Type': 'application/json' });
    case '/__reset':
      requests.length = 0;
      return send(200, 'ok', { 'Content-Type': 'text/plain' });
    case '/exfil':
      return send(200, 'leaked', { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    case '/sandbox':
      return send(200, frameDocument(), frameHeaders());
    case '/lib.js':
      return send(200, lib, { 'Content-Type': 'text/javascript' });
    case '/harness.js':
      return send(200, harness, { 'Content-Type': 'text/javascript' });
    case '/host-none.html':
      return send(200, page('no CSP'), { 'Content-Type': 'text/html' });
    case '/host-strict.html':
      return send(200, page('strict CSP'), { 'Content-Type': 'text/html', 'Content-Security-Policy': CSP.strict });
    case '/host-lax.html':
      return send(200, page('lax CSP'), { 'Content-Type': 'text/html', 'Content-Security-Policy': CSP.lax });
    case '/host-lax-noblob.html':
      return send(200, page('lax CSP without blob workers'), { 'Content-Type': 'text/html', 'Content-Security-Policy': CSP.laxNoBlob });
    default:
      return send(404, 'not found', { 'Content-Type': 'text/plain' });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`fixtures on http://127.0.0.1:${PORT}`));
