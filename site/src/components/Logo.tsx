/**
 * The Faustine mark (books on a shelf, the last two leaning) next to the
 * package name. The site belongs to the library, the mark says who builds it.
 */
export function LogoMark({ size = 26, inverted = false, className = "" }: { size?: number; inverted?: boolean; className?: string }) {
  const bg = inverted ? "#fff" : "#4c3dad";
  const bar = inverted ? "#4c3dad" : "#fff";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="5" fill={bg} />
      <rect x="8" y="8" width="3" height="16" rx="1" fill={bar} />
      <rect x="11.7" y="8" width="3" height="16" rx="1" fill={bar} />
      <rect x="15.2" y="9" width="3" height="15" rx="1" fill={bar} transform="rotate(15 16.7 24)" />
      <rect x="18.8" y="10" width="3" height="14" rx="1" fill={bar} transform="rotate(26 20.3 24)" />
    </svg>
  );
}

export function Logo({ inverted = false, wordmarkClass = "text-white" }: { inverted?: boolean; wordmarkClass?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark inverted={inverted} />
      <span className={`inline-flex items-baseline gap-1.5 ${wordmarkClass}`}>
        <span className="text-[1.02rem] font-semibold tracking-[-0.02em]">browser-sandbox</span>
        <span className="hidden font-mono text-[0.68rem] opacity-50 sm:inline">by Faustine</span>
      </span>
    </span>
  );
}
