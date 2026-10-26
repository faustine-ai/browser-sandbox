// What the model's code must not find in the worker. The frame's CSP already
// neutralises the network ones; removing them makes the failure a plain
// "is not defined" and keeps the guarantee from resting on one mechanism.

export const REMOVED_GLOBALS: readonly string[] = [
  'fetch',
  'fetchLater',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'WebTransport',
  'importScripts',
  'Worker',
  'SharedWorker',
  'navigator',
  'caches',
  'indexedDB',
  'BroadcastChannel',
  'postMessage',
  'onmessage',
  'onmessageerror',
  'onerror',
  'onunhandledrejection',
  'onrejectionhandled',
  'close',
  'location',
  'Request',
  'Response',
  'Headers',
  'reportError',
  'showOpenFilePicker',
  'showSaveFilePicker',
  'showDirectoryPicker',
];

/**
 * Removes each name from the scope and its prototype chain; what cannot be
 * deleted is shadowed by a frozen `undefined`. Returns the names that are
 * still reachable afterwards (none, in the engines we test).
 */
export function harden(scope: object, names: readonly string[] = REMOVED_GLOBALS): string[] {
  const left: string[] = [];
  for (const name of names) {
    let o: object | null = scope;
    while (o) {
      if (Object.prototype.hasOwnProperty.call(o, name)) {
        try {
          delete (o as Record<string, unknown>)[name];
        } catch {
          /* non-configurable */
        }
      }
      o = Object.getPrototypeOf(o);
    }
    if (name in scope) {
      try {
        Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false, enumerable: false });
      } catch {
        /* keep going */
      }
      if ((scope as Record<string, unknown>)[name] !== undefined) left.push(name);
    }
  }
  return left;
}
