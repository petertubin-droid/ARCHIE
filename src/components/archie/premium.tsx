// =========================================================
// FRELUX ARCHIE — PREMIUM UI KIT
//
// Shared building blocks for the ARCHIE PWA pages so every
// screen carries the same premium command-centre language:
// glassmorphic panels, gradient headlines, refined motion.
// Import the CSS layer once from ArchieLayout.
// =========================================================

import type { ReactNode } from "react";

/** Page shell: eyebrow, gradient headline, subtitle and content. */
export function ArchiePage({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="archie-fade-up mx-auto max-w-4xl px-4 py-4 md:py-6">
      <header className="mb-5">
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300/70">
            {eyebrow}
          </p>
        )}
        <h1 className="archie-title-gradient mt-1 text-lg font-semibold md:text-xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {subtitle}
          </p>
        )}
        <div
          aria-hidden
          className="mt-3 h-px bg-gradient-to-r from-amber-400/40 via-violet-400/20 to-transparent"
        />
      </header>
      {children}
    </div>
  );
}

/** Glassmorphic panel — the default container for content blocks. */
export function ArchiePanel({
  accent = false,
  className = "",
  children,
}: {
  accent?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`archie-panel ${accent ? "archie-panel-accent" : ""} rounded-xl ${className}`}
    >
      {children}
    </section>
  );
}

/** Small uppercase section label. */
export function ArchieSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
      {children}
    </h2>
  );
}

/** Compact stat tile with a gradient value. */
export function ArchieStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "positive" | "warning" | "critical";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "critical"
          ? "text-red-300"
          : "archie-stat-value";
  return (
    <div className="archie-panel rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

/** Primary action button with the amber glow treatment. */
export function ArchieButton({
  children,
  disabled,
  onClick,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`archie-btn-primary rounded-lg px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

/** Status / meta badge. */
export function ArchieBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "positive" | "warning" | "critical" | "accent";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "border-white/10 bg-white/[0.04] text-slate-300",
    positive: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    warning: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    critical: "border-red-400/30 bg-red-400/10 text-red-300",
    accent: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
