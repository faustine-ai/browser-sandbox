import type { CSSProperties, ReactNode } from "react";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-7 ${className}`}>{children}</div>;
}

/** Monospace eyebrow — marks "measurable" topics, same device as faustine.ai. */
export function Eyebrow({
  children,
  tone = "iris",
  className = "",
}: {
  children: ReactNode;
  tone?: "iris" | "muted" | "onDark";
  className?: string;
}) {
  const color = tone === "onDark" ? "text-iris-300" : tone === "muted" ? "text-zinc-500" : "text-iris-600";
  return (
    <span className={`mono-label inline-flex items-center gap-2 ${color} ${className}`}>
      <span aria-hidden className="h-px w-5 bg-current opacity-50" />
      {children}
    </span>
  );
}

type BtnProps = {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "ghostDark" | "ghostLight" | "outline";
  size?: "md" | "lg";
  className?: string;
  external?: boolean;
};

export function Button({ children, href = "#", variant = "primary", size = "md", className = "", external = false }: BtnProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 will-change-transform active:scale-[0.98]";
  const sizes = { md: "h-10 px-4 text-[0.9rem]", lg: "h-12 px-6 text-[0.95rem]" };
  const variants = {
    primary:
      "bg-iris text-white shadow-[0_10px_30px_-10px_rgba(108,92,231,0.7)] hover:bg-iris-600 hover:shadow-[0_14px_40px_-10px_rgba(108,92,231,0.85)] hover:-translate-y-0.5",
    ghostDark: "bg-white/[0.06] text-white ring-1 ring-inset ring-white/15 hover:bg-white/[0.12] hover:ring-white/25",
    ghostLight: "bg-zinc-900/[0.04] text-zinc-800 ring-1 ring-inset ring-zinc-900/10 hover:bg-zinc-900/[0.07]",
    outline: "text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:ring-zinc-400 hover:text-zinc-900",
  };
  return (
    <a
      href={href}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

export function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className} aria-hidden>
      <path d="M3 8h9m0 0L8.5 4.5M12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Eyebrow + heading + optional body. Every section opens with one. */
export function SectionHead({
  eyebrow,
  title,
  body,
  tone = "light",
  align = "left",
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  tone?: "light" | "dark";
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div className={`${centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"} ${className}`}>
      <Eyebrow tone={tone === "dark" ? "onDark" : "iris"} className={centered ? "justify-center" : ""}>
        {eyebrow}
      </Eyebrow>
      <h2
        className={`mt-5 text-balance text-[2rem] font-semibold leading-[1.08] tracking-[-0.032em] sm:text-[2.6rem] ${
          tone === "dark" ? "text-white" : "text-zinc-900"
        }`}
      >
        {title}
      </h2>
      {body ? (
        <p className={`mt-5 text-[1.05rem] leading-relaxed ${tone === "dark" ? "text-white/65" : "text-zinc-600"}`}>{body}</p>
      ) : null}
    </div>
  );
}

/** Inline keyword, on light or dark. */
export function Kbd({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <code
      className={`rounded-md px-1.5 py-0.5 font-mono text-[0.86em] ${
        dark ? "bg-white/[0.08] text-iris-200 ring-1 ring-inset ring-white/10" : "bg-iris-50 text-iris-900"
      }`}
    >
      {children}
    </code>
  );
}

/* ---------- Line icons (1.6 stroke) ---------- */
type IconProps = { className?: string; style?: CSSProperties };
const svg =
  (children: ReactNode) =>
  ({ className = "", style }: IconProps) => (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  );

export const Icons = {
  Shield: svg(
    <>
      <path d="M12 3 5 6v5c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>,
  ),
  Gauge: svg(
    <>
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="m13 13-3 3" />
      <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
    </>,
  ),
  Terminal: svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3M13 15h4" />
    </>,
  ),
  Check: svg(<path d="m5 12 4.5 4.5L19 7" />),
  Key: svg(
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="m11 11 8 8M16 16l2-2M18.5 13.5l1.5 1.5" />
    </>,
  ),
  Doc: svg(
    <>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4M9 13h6M9 16h6" opacity="0.7" />
    </>,
  ),
  Bolt: svg(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />),
  Cpu: svg(
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
    </>,
  ),
  Plug: svg(
    <>
      <path d="M9 2v6M15 2v6" />
      <path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z" />
      <path d="M12 17v5" />
    </>,
  ),
  Clock: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>,
  ),
  Layers: svg(
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M3 13l9 5 9-5M3 8v5m18-5v5" opacity="0.55" />
    </>,
  ),
  // no network: a globe with a bar through it
  Offline: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" opacity="0.55" />
      <path d="m5 5 14 14" />
    </>,
  ),
  // one door
  Door: svg(
    <>
      <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" />
      <path d="M3 21h18" />
      <path d="M14.5 12h.01" strokeWidth="2.4" />
    </>,
  ),
  // human in the loop
  Hand: svg(
    <>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M14 12V6.5a1.5 1.5 0 0 1 3 0V13" />
      <path d="M17 13V9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.8-2.4L4.6 14.3a1.5 1.5 0 0 1 2.4-1.8L8 14" />
    </>,
  ),
  // structured clone
  Clone: svg(
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>,
  ),
  // stop a loop
  Stop: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none" />
    </>,
  ),
  Scale: svg(
    <>
      <path d="M12 3v18M5 7h14" />
      <path d="M5 7 2.5 13a2.5 2.5 0 0 0 5 0L5 7ZM19 7l-2.5 6a2.5 2.5 0 0 0 5 0L19 7Z" />
    </>,
  ),
  Github: ({ className = "" }: IconProps) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  ),
  Npm: ({ className = "" }: IconProps) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M2 2h20v20H2V2Zm4 4v12h6V9h3v9h3V6H6Z" />
    </svg>
  ),
};
