"use client";

import { useState } from "react";
import { MONTHS, diffDays, prettyDay, toUTC } from "@/lib/shared/dates";

/** Step chart of the score over time; every red dot is a point lost. */
export function ScoreHistory({ points, height = 180 }: { points: { day: string; score: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const start = points[0].day;
  const end = points[points.length - 1].day;
  const span = Math.max(1, diffDays(end, start));
  const min = Math.min(...points.map((p) => p.score));
  const lo = Math.max(0, Math.min(90, min - 4));
  const x = (d: string) => (diffDays(d, start) / span) * 100;
  const y = (s: number) => ((100 - s) / (100 - lo)) * 100;

  let path = `M 0 ${y(points[0].score)}`;
  for (let i = 1; i < points.length; i++) path += ` H ${x(points[i].day)} V ${y(points[i].score)}`;
  const area = `${path} V 100 H 0 Z`;

  const drops = points.slice(1).map((p, i) => ({ ...p, prev: points[i].score })).filter((p) => p.score < p.prev);

  // Month ticks along the bottom
  const ticks: { label: string; at: number }[] = [];
  const s = toUTC(start);
  for (let m = 0; m < 30; m++) {
    const d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + m + 1, 1));
    const iso = d.toISOString().slice(0, 10);
    if (iso > end) break;
    ticks.push({ label: MONTHS[d.getUTCMonth()], at: x(iso) });
  }

  return (
    <div className="relative" style={{ height }}>
      <div className="absolute inset-y-0 left-0 flex w-8 flex-col justify-between pb-6 text-right font-mono text-[10px] text-ink-4">
        <span>100</span>
        <span>{Math.round((100 + lo) / 2)}</span>
        <span>{lo}</span>
      </div>
      <div className="absolute inset-y-0 right-0 left-10 pb-6">
        <div className="relative h-full">
          {[0, 50, 100].map((p) => (
            <div key={p} className="absolute inset-x-0 border-t border-dashed border-rule" style={{ top: `${p}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id="score-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--mor)" stopOpacity="0.18" />
                <stop offset="1" stopColor="var(--mor)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#score-fill)" />
            <path d={path} fill="none" stroke="var(--mor)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {drops.map((p, i) => (
            <button
              key={i}
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sheet bg-stamp"
              style={{ left: `${x(p.day)}%`, top: `${y(p.score)}%` }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`Score fell to ${p.score} on ${prettyDay(p.day)}`}
            />
          ))}
          {hover !== null && drops[hover] && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg border border-rule bg-sheet px-2.5 py-1.5 text-[12px] whitespace-nowrap shadow-[var(--shadow-lift)]"
              style={{ left: `${x(drops[hover].day)}%`, top: `${y(drops[hover].score)}%` }}
            >
              <b className="text-stamp">{drops[hover].prev} → {drops[hover].score}</b> · {prettyDay(drops[hover].day)}
            </div>
          )}
          <div className="absolute -right-1 size-3 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sheet bg-mor" style={{ top: `${y(points[points.length - 1].score)}%` }} />
        </div>
        <div className="relative mt-1.5 h-4">
          {ticks.map((t) => (
            <span key={t.label + t.at} className="absolute -translate-x-1/2 font-mono text-[10px] text-ink-4" style={{ left: `${t.at}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
