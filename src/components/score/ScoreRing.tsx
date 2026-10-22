"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { Band, Penalty } from "@/lib/shared/types";
import { BAND_META } from "@/lib/shared/score";
import { prettyDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { BAND_COLOR, Ticker } from "@/components/ui/primitives";

/**
 * The Saakh score as 100 marks around a seal. Every mark is one point; each
 * point lost to a late month is punched out in red, and hovering it says which
 * debt cost it. The ring empties anticlockwise from the top.
 */
export function ScoreRing({
  score,
  band,
  penalties = [],
  size = 200,
  showLabel = true,
  className,
}: {
  score: number;
  band: Band;
  penalties?: Penalty[];
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Marks draw in once on mount; after that they're static so re-renders never hide them.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1400);
    return () => clearTimeout(t);
  }, []);
  const c = size / 2;
  const R = c - 3;
  const small = size < 120;
  const L = small ? size * 0.11 : size * 0.085;
  const kept = Math.max(0, Math.min(100, score));
  const color = BAND_COLOR[band];

  const pos = (i: number, r: number) => {
    const a = ((-90 + i * 3.6) * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  };

  const penaltyFor = (i: number): Penalty | undefined => penalties[99 - i];
  const tip = hover !== null ? penaltyFor(hover) : undefined;
  const [tx, ty] = hover !== null ? pos(hover, R + 6) : [0, 0];

  return (
    <div className={clsx("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Saakh score ${score} out of 100`}>
        <circle cx={c} cy={c} r={R - L - (small ? 3 : 7)} fill="none" stroke="var(--rule)" strokeWidth={1} strokeDasharray="2 3" />
        {Array.from({ length: 100 }, (_, i) => {
          const lost = i >= kept;
          const [x1, y1] = pos(i, R);
          const [x2, y2] = pos(i, R - L);
          if (!lost)
            return (
              <line
                key={`k${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--ink)"
                strokeOpacity={0.82}
                strokeWidth={small ? 1.3 : 1.7}
                strokeLinecap="round"
                style={intro ? { animation: `tick-in 420ms ${i * 5}ms both` } : undefined}
              />
            );
          const [mx, my] = pos(i, R - L / 2);
          const p = penaltyFor(i);
          return (
            <g
              key={`l${i}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              style={{ cursor: p ? "help" : undefined }}
            >
              <circle
                cx={mx}
                cy={my}
                r={small ? 1.6 : 2.6}
                fill={p?.settled ? "none" : "var(--stamp)"}
                stroke="var(--stamp)"
                strokeWidth={small ? 1 : 1.4}
                style={{ transformOrigin: `${mx}px ${my}px`, animation: `punch 520ms ${intro ? 380 + (99 - i) * 22 : 0}ms both` }}
              />
              <circle cx={mx} cy={my} r={small ? 4 : 7} fill="transparent" />
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          <div className="display-tight font-bold" style={{ color, fontSize: size * 0.3 }}>
            <Ticker value={score} />
          </div>
          {showLabel && !small && (
            <>
              <div className="mt-1 text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">of 100</div>
              <div className="mt-2 text-[13px] font-semibold" style={{ color }}>
                {BAND_META[band].label}
              </div>
            </>
          )}
        </div>
      </div>

      {tip && (
        <div
          className="pointer-events-none absolute z-20 w-56 -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-xl border border-rule bg-sheet p-3 text-left shadow-[var(--shadow-lift)]"
          style={{ left: tx, top: ty }}
        >
          <p className="text-[12px] font-semibold text-stamp">−1 point · month {tip.month} late</p>
          <p className="mt-1 text-[13px] text-ink">
            {rupees(tip.amount)} to {tip.creditor}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            Due {prettyDay(tip.dueDate)} · lost {prettyDay(tip.droppedOn)}
            {tip.settled ? " · since paid" : " · still unpaid"}
          </p>
        </div>
      )}
    </div>
  );
}
