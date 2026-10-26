// The worker's first message carries the port; after that the scope is
// hardened and the runtime owns the port in a closure. Nothing else ever
// reaches this code.
import { startRuntime } from './runtime';
import { harden } from './scope';

declare const self: {
  onmessage: ((ev: { data: unknown; ports: ReadonlyArray<{ postMessage(m: unknown): void; onmessage: unknown }> }) => void) | null;
} & Record<string, unknown>;

self.onmessage = (ev) => {
  const port = ev.ports && ev.ports[0];
  if (!port) return;
  self.onmessage = null;
  harden(self);
  startRuntime(port as never, { scope: self });
};
