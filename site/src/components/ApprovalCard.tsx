/**
 * An example of the card a host renders for a `pending` result: one row per
 * marked call, drawn from `result.pending` (name and arguments come from the
 * sandbox, not from the model), and the two fixed buttons. The library does
 * not ship this card; the host draws it, which the "your UI" pill says.
 * Static markup.
 */
const ROWS = [
  { seq: 3, fn: "orders.cancel", input: '{ "id": "ord_8f21" }' },
  { seq: 4, fn: "orders.cancel", input: '{ "id": "ord_8f3a" }' },
  { seq: 5, fn: "orders.cancel", input: '{ "id": "ord_9012" }' },
];

export function ApprovalCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-card" role="group" aria-label="Approval card example">
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.95rem] font-semibold text-zinc-900">Cancel 3 orders</p>
          <p className="text-[0.82rem] text-zinc-500">Open orders over $100 from last week. This cannot be undone.</p>
        </div>
        <span className="mt-0.5 inline-flex h-[22px] shrink-0 items-center rounded-full border border-amber/60 bg-amber/10 px-2.5 text-[11px] font-medium text-amber-700">
          your UI
        </span>
      </div>
      <div className="mx-4 mb-4 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 sm:mx-5">
        <p className="mono-label text-zinc-400">This will run 3 operations</p>
        <ul className="mt-2 space-y-1.5">
          {ROWS.map((r) => (
            <li key={r.seq} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.8rem]">
              <span className="font-mono font-semibold text-zinc-900">{r.fn}</span>
              <code className="font-mono text-[0.74rem] text-zinc-500">{r.input}</code>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 sm:px-5">
        <span className="inline-flex h-8 items-center rounded-full px-3.5 text-[0.8rem] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-300">Cancel</span>
        <span className="inline-flex h-8 items-center rounded-full bg-rose-600 px-3.5 text-[0.8rem] font-medium text-white">Cancel the 3 orders</span>
      </div>
    </div>
  );
}
