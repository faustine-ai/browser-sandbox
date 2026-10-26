// The frame document's only script: a relay with no logic. It accepts one
// `init` from its parent (with the control port), then spawns and kills
// workers on request, transferring each worker its own port. It never
// listens to a worker's messages, so a worker's `postMessage` reaches nobody.
import { INIT, READY, type FrameToHost, type HostToFrame } from '../bridge/protocol';

(() => {
  const VERSION = 1;
  let nonce: string | null = null;
  let control: MessagePort | null = null;
  const workers = new Map<string, Worker>();
  const blobs = new Map<string, string>();

  const reply = (m: FrameToHost) => control?.postMessage(m);

  const onControl = (ev: MessageEvent) => {
    const d = ev.data as HostToFrame | null;
    if (!d || typeof d !== 'object' || d.nonce !== nonce) return;
    if (d.t === 'spawn') {
      const workerPort = ev.ports[0];
      if (!workerPort) return reply({ t: 'spawn-error', id: d.id, message: 'no port' });
      try {
        let url = blobs.get(d.sourceHash);
        if (!url) {
          url = URL.createObjectURL(new Blob([d.source], { type: 'text/javascript' }));
          blobs.set(d.sourceHash, url);
        }
        const w = new Worker(url);
        w.onerror = (e) => reply({ t: 'worker-error', id: d.id, message: String((e && (e as ErrorEvent).message) || e) });
        workers.set(d.id, w);
        w.postMessage({ t: 'port' }, [workerPort]);
        reply({ t: 'spawned', id: d.id });
      } catch (err) {
        reply({ t: 'spawn-error', id: d.id, message: err instanceof Error ? err.message : String(err) });
      }
    } else if (d.t === 'kill') {
      const w = workers.get(d.id);
      if (w) {
        w.terminate();
        workers.delete(d.id);
      }
      reply({ t: 'killed', id: d.id });
    }
  };

  window.addEventListener('message', (ev) => {
    const d = ev.data as { t?: unknown; nonce?: unknown; v?: unknown } | null;
    if (nonce !== null || !d || d.t !== INIT || typeof d.nonce !== 'string') return;
    if (ev.source !== window.parent) return;
    const port = ev.ports[0];
    if (!port) return;
    nonce = d.nonce;
    control = port;
    port.onmessage = onControl;
  });

  window.parent.postMessage({ t: READY, v: VERSION }, '*');
})();
