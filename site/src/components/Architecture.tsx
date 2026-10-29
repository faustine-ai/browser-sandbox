/**
 * The architecture as one drawing:
 * the page with the functions it defines and the approval prompt it renders,
 * the channel, and the sandbox frame with the worker inside. Same structure
 * and copy as the design; colors and type are the site's tokens.
 *
 * Wide (lg+): page | channel | sandbox in one row, arrows horizontal.
 * Narrow: stacked, arrows vertical between the two.
 */

const MONO = { fontFamily: "var(--font-mono)" } as const;

export function Architecture({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col gap-6 rounded-[20px] border border-mint/35 bg-ink-2 p-4 text-white shadow-iris sm:gap-7 sm:p-7 ${className}`}
      style={MONO}
      role="img"
      aria-label="Your page defines functions and renders the approval prompt; the model's code runs in a Worker inside a sandboxed iframe and reaches those functions only over a message channel."
    >
      {/* header */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="flex items-center gap-2.5 text-[17px] font-semibold sm:text-lg">
          <Dot className="bg-mint" />
          your page
        </span>
        <span className="text-[13px] text-white/55 sm:text-sm">https://app.example.com</span>
      </div>

      <div className="flex flex-wrap items-stretch gap-5 lg:flex-nowrap">
        {/* ── your page: functions + prompt ── */}
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <div className="flex flex-col gap-3.5 rounded-[14px] border border-ink-line bg-ink p-3.5 text-[12.5px] leading-[1.7] [overflow-wrap:anywhere] sm:p-5 sm:text-sm">
            <span className="text-[15px] font-semibold">defineFunctions</span>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-x-3.5 px-3 py-1.5">
                <span className="text-iris-300">orders.list</span>
                <span className="text-white/55">(i) =&gt; api.orders.list(i)</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[10px] border border-amber/55 bg-amber/8 px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-3.5">
                  <span className="text-iris-300">orders.cancel</span>
                  <span className="text-white/55">(i) =&gt; api.orders.cancel(i)</span>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 pl-4">
                  <span className="text-white/55">└</span>
                  <span className="font-semibold text-amber">approval: true</span>
                </div>
              </div>
            </div>
            <div className="border-t border-ink-line pt-3">sandbox.run({"{"} code, functions {"}"})</div>
          </div>

          {/* the prompt the host renders */}
          <div
            className="flex flex-col gap-3 rounded-[14px] border border-amber/55 bg-ink-3 px-4 py-4 sm:px-[18px]"
            style={{ fontFamily: "var(--font-sans)", boxShadow: "0 12px 32px -12px color-mix(in srgb, var(--color-amber) 35%, transparent)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold">Cancel order #4821?</span>
              <span className="inline-flex h-[22px] items-center rounded-full border border-amber/50 bg-amber/12 px-2.5 text-[11px] font-medium text-amber">your UI</span>
            </div>
            <span className="text-[13px] text-white/55">
              Rendered by your <span className="text-white" style={MONO}>onApproval</span> callback. The call runs only if it resolves true.
            </span>
            <div className="flex justify-end gap-2">
              <span className="inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium text-white/70">Deny</span>
              <span className="inline-flex h-8 items-center rounded-full bg-iris px-3.5 text-[13px] font-medium text-white">Approve</span>
            </div>
          </div>
        </div>

        {/* ── the channel, vertical (narrow) ── */}
        <div className="flex flex-[1_1_100%] justify-center gap-10 text-xs text-white/55 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-11 flex-col items-center">
              <div className="w-px flex-1 bg-iris" />
              <div className="h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-iris" />
            </div>
            <span>value</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-11 flex-col items-center">
              <div className="h-0 w-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-iris" />
              <div className="w-px flex-1 bg-iris" />
            </div>
            <span>call(input)</span>
          </div>
        </div>

        {/* ── the channel, horizontal (wide) ── */}
        <div className="hidden flex-[0_0_130px] flex-col justify-center gap-[22px] text-center text-xs text-white/55 lg:flex">
          <div className="flex flex-col gap-1.5">
            <span>value</span>
            <div className="flex items-center">
              <div className="h-px flex-1 bg-iris" />
              <div className="h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-iris" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center">
              <div className="h-0 w-0 border-y-[5px] border-r-[7px] border-y-transparent border-r-iris" />
              <div className="h-px flex-1 bg-iris" />
            </div>
            <span>call(input)</span>
          </div>
        </div>

        {/* ── the sandbox ── */}
        <div className="flex min-w-0 flex-[1.5_1_300px] flex-col gap-4 rounded-[14px] border border-rose/40 p-3.5 text-[12.5px] [overflow-wrap:anywhere] sm:p-5 sm:text-sm">
          <span className="flex items-center gap-2.5 text-[17px] font-semibold sm:text-lg">
            <Dot className="bg-rose" />
            browser-sandbox
          </span>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[15px] font-semibold">&lt;iframe sandbox=&quot;allow-scripts&quot;&gt;</span>
            <span className="text-[13px] text-white/55">origin &quot;null&quot; · connect-src &apos;none&apos;</span>
          </div>

          <div className="flex flex-col gap-[18px] rounded-xl border border-rose/40 bg-ink p-3.5 leading-[1.8] sm:p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[15px] font-semibold">Worker</span>
              <span className="text-[13px] text-white/55">the model&apos;s code</span>
            </div>
            <div className="flex flex-col gap-0.5 text-white/55">
              <div className="px-2.5">
                const open = await <span className="text-iris-300">sdk.orders.list</span>(filter)
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-amber/45 bg-amber/8 px-2.5 py-0.5">
                <span>
                  await <span className="text-iris-300">sdk.orders.cancel</span>({"{"} id: open[0].id {"}"})
                </span>
                <span className="text-xs text-amber">⏸ waits for approval</span>
              </div>
              <div className="px-2.5">return open.length</div>
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-white/55">
              <span className="line-through">fetch</span>
              <span className="line-through">document</span>
              <span className="line-through">localStorage</span>
              <span className="text-rose">· terminated on timeout</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`} aria-hidden />;
}
