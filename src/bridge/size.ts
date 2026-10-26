// Best-effort byte size of a value as it would be serialised. Blobs and
// Files count their bytes; JSON values their UTF-8 length; the rest 0.

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

export function byteSize(value: unknown): number {
  if (value === undefined || value === null) return 4;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  try {
    const s = JSON.stringify(value);
    if (typeof s !== 'string') return 0;
    return encoder ? encoder.encode(s).length : s.length;
  } catch {
    return 0;
  }
}

/** Key-order independent JSON, so the same arguments hash the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return `{"$blob":${value.size}}`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
