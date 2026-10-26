// Runs inside the host pages: a fixed function set and a `run` helper the
// Playwright specs call through page.evaluate.
import * as lib from '/lib.js';

const hits = { del: 0, count: 0, slowStarted: 0 };

const functions = lib.defineFunctions({
  echo: (x) => x,
  'math.add': ({ a, b }) => a + b,
  'math.mul': ({ a, b }) => a * b,
  slow: async (ms) => {
    hits.slowStarted++;
    await new Promise((r) => setTimeout(r, ms));
    return ms;
  },
  big: (n) => 'x'.repeat(n),
  fail: () => {
    throw new Error('nope');
  },
  unclonable: () => () => 1,
  blob: () => new Blob(['hello'], { type: 'text/plain' }),
  del: { call: (x) => {
    hits.del++;
    return { ok: true, id: x && x.id };
  }, approval: true, description: 'Deletes a thing' },
  count: () => ++hits.count,
  help: { call: () => 'help text', description: 'Help' },
});

function strip(r) {
  const out = { runId: r.runId, status: r.status, logs: r.logs, calls: r.calls, stats: r.stats };
  if ('value' in r) out.value = r.value instanceof Blob ? { blobSize: r.value.size } : r.value;
  if ('error' in r) out.error = r.error;
  if ('limit' in r) out.limit = r.limit;
  if ('pending' in r) out.pending = r.pending;
  return JSON.parse(JSON.stringify(out));
}

window.harness = {
  lib,
  hits,
  sandboxes: {},
  create(name, frame, opts = {}) {
    const s = lib.createSandbox({ frame: frame === 'srcdoc' ? { srcdoc: true } : { url: frame }, ...opts });
    this.sandboxes[name] = s;
    return s.ready.then(
      () => ({ state: s.state }),
      (e) => ({ state: s.state, error: { name: e.name, message: e.message } }),
    );
  },
  async run(name, code, { approval = 'deny', caps, values, abortAfter, resumeWith, root } = {}) {
    const sandbox = this.sandboxes[name];
    let approvalOpt = { mode: 'deny' };
    if (approval === 'pause-approve') approvalOpt = { mode: 'pause', onApproval: async () => 'approve' };
    if (approval === 'pause-reject') approvalOpt = { mode: 'pause', onApproval: async () => 'reject' };
    if (approval === 'pause-slow') approvalOpt = { mode: 'pause', onApproval: () => new Promise((r) => setTimeout(() => r('approve'), 1500)) };
    if (approval === 'collect') approvalOpt = { mode: 'collect' };
    if (approval === 'collect-auto') approvalOpt = { mode: 'collect', onApproval: async () => ({ all: 'approve' }) };
    if (approval === 'collect-reject') approvalOpt = { mode: 'collect', onApproval: async () => ({ all: 'reject' }) };
    const ctrl = new AbortController();
    if (abortAfter) setTimeout(() => ctrl.abort(), abortAfter);
    const vals = values === 'file' ? { files: { a: new File(['hello file'], 'a.txt', { type: 'text/plain' }) } } : values;
    let r = await sandbox.run({ code, functions, scope: { root, values: vals }, approval: approvalOpt, caps, signal: ctrl.signal });
    if (r.status === 'pending' && resumeWith) r = await r.resume(resumeWith);
    window.__last = r;
    return strip(r);
  },
  async resume(decisions) {
    const r = await window.__last.resume(decisions);
    window.__last = r;
    return strip(r);
  },
  dispose(name) {
    this.sandboxes[name].dispose();
    delete this.sandboxes[name];
  },
};
window.__harnessReady = true;
