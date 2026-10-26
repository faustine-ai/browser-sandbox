// The real worker runtime wired to the real host engine through a fake port
// pair that clones like the browser does (structuredClone rejects functions).
import type { HostToWorker, WorkerToHost } from '../../src/bridge/protocol';
import type { RunDeps, WorkerLink } from '../../src/core/run';
import { startRuntime, type PortLike } from '../../src/worker/runtime';

export interface Pair {
  link: WorkerLink;
  scope: Record<string, unknown>;
  killed: () => boolean;
  /** Inject a raw message as if the worker had sent it. */
  fromWorker: (m: WorkerToHost) => void;
}

export function makePair(): Pair {
  let hostCb: ((m: WorkerToHost) => void) | null = null;
  let errCb: ((m: string) => void) | null = null;
  let killed = false;
  const scope: Record<string, unknown> = {};
  const workerPort: PortLike = {
    onmessage: null,
    postMessage(m) {
      const copy = structuredClone(m) as WorkerToHost;
      if (killed) return;
      setTimeout(() => hostCb?.(copy), 0);
    },
  };
  startRuntime(workerPort, { scope });
  const link: WorkerLink = {
    post(m: HostToWorker) {
      const copy = structuredClone(m);
      if (killed) return;
      setTimeout(() => workerPort.onmessage?.({ data: copy }), 0);
    },
    onMessage(cb) {
      hostCb = cb;
    },
    onError(cb) {
      errCb = cb;
    },
    kill() {
      killed = true;
    },
  };
  return { link, scope, killed: () => killed, fromWorker: (m) => hostCb?.(m), ...{ crash: (msg: string) => errCb?.(msg) } };
}

export function deps(pair = makePair()): RunDeps & { pair: Pair; released: { reusable: boolean }[] } {
  const released: { reusable: boolean }[] = [];
  return {
    pair,
    released,
    spawn: async () => pair.link,
    release: (_l, reusable) => released.push({ reusable }),
    now: () => performance.now(),
  };
}
