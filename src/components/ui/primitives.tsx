"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { animate, useInView, useMotionValue, useMotionValueEvent } from "motion/react";
import type { AgentName, Band, Phase, SlipView } from "@/lib/shared/types";
import { AGENTS } from "@/lib/shared/agents";
import { BAND_META } from "@/lib/shared/score";
import { spanLabel } from "@/lib/shared/dates";

// ---------- Button ----------

type BtnVariant = "primary" | "voice" | "secondary" | "ghost" | "danger" | "quiet";
const BTN: Record<BtnVariant, string> = {
  primary:
    "bg-mor text-on-mor hover:bg-mor-2 shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_8px_18px_-10px_var(--mor)]",
  voice:
    "bg-genda text-on-genda font-semibold hover:bg-genda-2 shadow-[0_1px_0_rgb(255_255_255/0.45)_inset,0_8px_18px_-10px_var(--genda-2)]",
  secondary: "bg-sheet text-ink border border-rule-2 hover:border-ink-3 hover:bg-sheet-2",
  ghost: "text-ink-2 hover:bg-paper-deep hover:text-ink",
  danger: "bg-sheet text-stamp border border-stamp/40 hover:bg-stamp-soft",
  quiet: "text-mor hover:bg-mor-soft",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; loading?: boolean }
>(function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background,border,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none whitespace-nowrap",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-[14px]",
        size === "lg" && "h-12 px-6 text-[15.5px]",
        BTN[variant],
        className,
      )}
      {...rest}
    >
      {loading && <span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ---------- Avatar ----------

// Avatar hues, picked to stay clear of violet and magenta.
const HUES = [30, 55, 85, 125, 155, 180, 205, 230];

function hue(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return HUES[h % HUES.length];
}

export function Avatar({ id, name, size = 36, className }: { id: string; name: string; size?: number; className?: string }) {
  const initials = name
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const h = hue(id);
  return (
    <span
      aria-hidden
      className={clsx("inline-grid shrink-0 place-items-center rounded-[10px] font-semibold display", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `oklch(0.93 0.04 ${h})`,
        color: `oklch(0.38 0.11 ${h})`,
      }}
    >
      {initials}
    </span>
  );
}

// ---------- Agent glyph ----------

export function AgentGlyph({ agent, size = 26, className }: { agent: AgentName; size?: number; className?: string }) {
  const a = AGENTS[agent];
  return (
    <span
      title={`${a.title} · ${a.role}`}
      className={clsx("inline-grid shrink-0 place-items-center rounded-full font-semibold leading-none", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.46,
        color: a.color,
        background: `color-mix(in oklab, ${a.color} 13%, var(--sheet))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${a.color} 32%, transparent)`,
      }}
    >
      <span style={{ transform: "translateY(0.06em)" }}>{a.glyph}</span>
    </span>
  );
}

// ---------- Band & phase ----------

export const BAND_COLOR: Record<Band, string> = {
  excellent: "var(--neem)",
  good: "var(--mor)",
  watch: "var(--haldi-ink)",
  risky: "var(--stamp)",
};

export function BandPill({ band, withHindi = false, className }: { band: Band; withHindi?: boolean; className?: string }) {
  const m = BAND_META[band];
  return (
    <span
      className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold", className)}
      style={{ color: BAND_COLOR[band], background: `color-mix(in oklab, ${BAND_COLOR[band]} 12%, var(--sheet))` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: BAND_COLOR[band] }} />
      {m.label}
      {withHindi && <span className="font-deva font-medium opacity-80">· {m.hindi}</span>}
    </span>
  );
}

export function ScoreChip({ score, band, className }: { score: number; band: Band; className?: string }) {
  return (
    <span
      className={clsx("inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-[13px] font-bold tabular display", className)}
      style={{ color: BAND_COLOR[band], background: `color-mix(in oklab, ${BAND_COLOR[band]} 12%, var(--sheet))` }}
      title={`Saakh score ${score} · ${BAND_META[band].label}`}
    >
      {score}
    </span>
  );
}

const PHASE: Record<Phase, { label: (s: SlipView) => string; fg: string; bg: string }> = {
  awaiting: { label: () => "Awaiting confirmation", fg: "var(--mor)", bg: "var(--mor-soft)" },
  disputed: { label: () => "Disputed", fg: "var(--stamp)", bg: "var(--stamp-soft)" },
  countered: { label: (s) => `Counter: ₹${s.dispute?.counterAmount?.toLocaleString("en-IN")}`, fg: "var(--haldi-ink)", bg: "var(--haldi-soft)" },
  withdrawn: { label: () => "Withdrawn", fg: "var(--ink-3)", bg: "var(--paper-deep)" },
  upcoming: { label: (s) => `Due in ${s.daysToDue} days`, fg: "var(--neem)", bg: "var(--neem-soft)" },
  due_soon: { label: (s) => `Due in ${s.daysToDue} day${s.daysToDue === 1 ? "" : "s"}`, fg: "var(--haldi-ink)", bg: "var(--haldi-soft)" },
  due_today: { label: () => "Due today", fg: "var(--haldi-ink)", bg: "var(--haldi-soft)" },
  overdue: { label: (s) => `${spanLabel(s.daysOverdue)} overdue`, fg: "var(--stamp)", bg: "var(--stamp-soft)" },
  payment_claimed: { label: () => "Payment to confirm", fg: "var(--mor)", bg: "var(--mor-soft)" },
  paid_on_time: { label: () => "Paid on time", fg: "var(--neem)", bg: "var(--neem-soft)" },
  paid_late: { label: (s) => `Paid ${s.daysOverdue}d late`, fg: "var(--ink-2)", bg: "var(--paper-deep)" },
};

export function PhasePill({ slip, className }: { slip: SlipView; className?: string }) {
  const p = PHASE[slip.phase];
  return (
    <span
      className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold", className)}
      style={{ color: p.fg, background: p.bg }}
    >
      {slip.phase === "overdue" && <span className="size-1.5 rounded-full bg-stamp writing-dot" />}
      {p.label(slip)}
    </span>
  );
}

// ---------- Numbers ----------

export function Ticker({ value, format = (n: number) => Math.round(n).toLocaleString("en-IN"), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(value);
  const [text, setText] = useState(format(value));
  const first = useRef(true);
  useMotionValueEvent(mv, "change", (v) => setText(format(v)));
  useEffect(() => {
    if (!inView) return;
    if (first.current) {
      first.current = false;
      mv.set(Math.max(0, value * 0.85));
    }
    const c = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, inView, mv]);
  return (
    <span ref={ref} className={clsx("tabular", className)}>
      {text}
    </span>
  );
}

// ---------- Layout bits ----------

export function SectionTitle({ children, count, action, hindi }: { children: React.ReactNode; count?: number; action?: React.ReactNode; hindi?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="display flex items-baseline gap-2 text-[19px] font-semibold text-ink">
        {children}
        {hindi && <span className="font-deva text-[14px] font-normal text-ink-4">{hindi}</span>}
        {count !== undefined && (
          <span className="rounded-full bg-paper-deep px-2 py-px text-[12px] font-semibold text-ink-2 tabular">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-rule-2 px-6 py-8 text-center">
      <p className="hand text-[20px]">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-rule-2 bg-sheet px-1.5 py-px font-mono text-[11px] text-ink-3">{children}</kbd>;
}
