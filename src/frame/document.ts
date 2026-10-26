// The frame document and the headers to serve it with. The script is hashed,
// so the document is static and cacheable and needs no nonce; the same hash
// goes in the <meta> policy, which is what `srcdoc` mode relies on.
import { RELAY_SHA256, RELAY_SOURCE } from '../generated/embeds';

export const FRAME_PROTOCOL_VERSION = 1;

/** The policy the frame document and, by inheritance, the worker run under. */
export const FRAME_CSP = [
  "default-src 'none'",
  "connect-src 'none'",
  "img-src 'none'",
  `script-src 'sha256-${RELAY_SHA256}' 'unsafe-eval'`,
  'worker-src blob:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function frameDocument(): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">` +
    '<title>sandbox</title></head><body>' +
    `<script>${RELAY_SOURCE}</script>` +
    '</body></html>'
  );
}

/** Headers for a static route serving `frameDocument()`. */
export function frameHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `${FRAME_CSP}; frame-ancestors *`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
}

/** A short identifier of this document's content, for a `?v=` query. */
export function frameVersion(): string {
  return RELAY_SHA256.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
}
