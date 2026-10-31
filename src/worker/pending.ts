// collect mode: a deferred call hands back a poisoned value instead of a
// result. Nothing happens while nobody looks at it; the first read, coercion,
// spread or call throws `PendingObserved`, which ends the pass. An `await`
// probes `.then` — that is the language looking, not the code — so it must
// not count, or nothing could ever be collected.

export const PENDING_OBSERVED = 'PendingObserved';
const SEQ = Symbol('pendingSeq');

export function pendingError(): Error {
  const e = new Error("This operation is waiting for the user's approval, so its result is not available yet.");
  e.name = PENDING_OBSERVED;
  return e;
}

export function makePending(seq: number): unknown {
  const target = function pending() {};
  const throwing = () => {
    throw pendingError();
  };
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === SEQ) return seq;
      if (prop === 'then' || prop === Symbol.toStringTag) return undefined;
      throw pendingError();
    },
    set: throwing,
    has: throwing,
    deleteProperty: throwing,
    ownKeys: throwing,
    getOwnPropertyDescriptor: throwing,
    defineProperty: throwing,
    apply: throwing,
    construct: throwing,
    getPrototypeOf: throwing,
    setPrototypeOf: throwing,
  });
}

/** The seq of a pending value, or null for anything else. */
export function pendingSeq(value: unknown): number | null {
  if ((typeof value !== 'function' && typeof value !== 'object') || value === null) return null;
  try {
    const s = (value as Record<symbol, unknown>)[SEQ];
    return typeof s === 'number' ? s : null;
  } catch {
    return null;
  }
}

/**
 * Whether a value is, or carries, a pending value: the run's return value
 * is looked at by the host, so returning one is an observation too. Walks
 * arrays, plain objects, Maps and Sets; anything else cannot hold a proxy
 * that structured clone would reach.
 */
export function containsPending(value: unknown, seen = new Set<object>()): boolean {
  if (pendingSeq(value) !== null) return true;
  if (typeof value !== 'object' || value === null || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((v) => containsPending(v, seen));
  if (value instanceof Map) {
    for (const [k, v] of value) if (containsPending(k, seen) || containsPending(v, seen)) return true;
    return false;
  }
  if (value instanceof Set) {
    for (const v of value) if (containsPending(v, seen)) return true;
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  for (const k of Object.keys(value)) if (containsPending((value as Record<string, unknown>)[k], seen)) return true;
  return false;
}
