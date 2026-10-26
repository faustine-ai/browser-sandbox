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
