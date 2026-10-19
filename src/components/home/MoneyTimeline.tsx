"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import type { SlipView } from "@/lib/shared/types";
import { prettyDay, spanLabel } from "@/lib/shared/dates";
import { rupees, rupeesShort } from "@/lib/shared/money";
import { useApp } from "@/components/providers/Providers";

interface Bubble {
  slip: SlipView;
  dir: "in" | "out";
  x: number;
  y: number;
  r: number;
  color: string;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// Time runs on a square-root scale so this week gets more room than last spring.
const TICKS = [-180, -90, -30, -7, 0, 7, 30, 90];
function tickLabel(d: number) {
  if (d === 0) return "Today";
  const a = Math.abs(d);
  const s = a === 7 ? "1 wk" : a === 30 ? "1 mo" : a === 90 ? "3 mo" : a === 180 ? "6 mo" : `${a}d`;
  return s;
}

/**
 * Every open slip as a bubble on a line through today: money coming to you
 * floats above, money you owe hangs below. Left of today is late. Bubble size
 * is the amount.
 */
export function MoneyTimeline({ slips, actorId, height: minH = 250 }: { slips: SlipView[]; actorId: string; height?: number }) {
  const { openSlip } = useApp();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);

  const open = useMemo(() => slips.filter((s) => s.status === "confirmed"), [slips]);
  const past = Math.max(30, Math.min(240, Math.max(0, ...open.map((s) => -s.daysToDue))));
  const future = Math.max(30, Math.min(120, Math.max(0, ...open.map((s) => s.daysToDue))));

  const layout = useMemo(() => {
    const gutter = width < 480 ? 50 : 66;
    const reach = width < 480 ? 24 : 30;
    const padL = gutter + reach;
    const padR = reach;
    const inner = Math.max(1, width - padL - padR);
    const sp = Math.sqrt(past);
    const sf = Math.sqrt(future);
    const zero = padL + (sp / (sp + sf)) * inner;
    const x = (d: number) => {
      const c = Math.max(-past, Math.min(future, d));
      return c < 0 ? zero - (Math.sqrt(-c) / sp) * (zero - padL) : zero + (Math.sqrt(c) / sf) * (padL + inner - zero);
    };
    const maxAmt = Math.max(1, ...open.map((s) => s.amount));
    const placed: Bubble[] = [];
    const sorted = [...open].sort((a, b) => b.amount - a.amount);
    for (const s of sorted) {
      const dir: "in" | "out" = s.creditor.id === actorId ? "in" : "out";
      const r = 7 + Math.sqrt(s.amount / maxAmt) * (width < 480 ? 16 : 22);
      const bx = x(s.daysToDue);
      let off = r + 10;
      // Nudge outward from the axis until it stops overlapping a neighbour.
      for (let guard = 0; guard < 60; guard++) {
        const by = dir === "in" ? -off : off;
        const hit = placed.some((p) => p.dir === dir && Math.hypot(p.x - bx, p.y - by) < p.r + r + 3);
        if (!hit) break;
        off += 6;
      }
      const color =
        s.phase === "overdue" ? "var(--stamp)" : s.phase === "due_soon" || s.phase === "due_today" ? "var(--haldi)" : dir === "in" ? "var(--neem)" : "var(--ink-2)";
      placed.push({ slip: s, dir, x: bx, y: dir === "in" ? -off : off, r, color });
    }
    const up = Math.max(60, ...placed.filter((p) => p.dir === "in").map((p) => -p.y + p.r + 8));
    const down = Math.max(60, ...placed.filter((p) => p.dir === "out").map((p) => p.y + p.r + 8));
    const need = 36 + up + down + 22;
    const extra = Math.max(0, minH - need);
    return { x, zero, gutter, placed, axisY: 36 + up + extra / 2, height: need + extra };
  }, [open, width, past, future, actorId, minH]);

  const ticks = TICKS.filter((t) => t >= -past && t <= future);
  const hovered = layout.placed.find((p) => p.slip.id === hover);
  const lateIn = open.filter((s) => s.phase === "overdue" && s.creditor.id === actorId).reduce((a, s) => a + s.amount, 0);
  const lateOut = open.filter((s) => s.phase === "overdue" && s.debtor.id === actorId).reduce((a, s) => a + s.amount, 0);

  return (
    <div>
      <div ref={ref} className="relative" style={{ height: layout.height }}>
        {width > 0 && (
          <svg width={width} height={layout.height} className="absolute inset-0 overflow-visible" role="img" aria-label={`${open.length} open slips laid out by due date. ${rupees(lateIn)} is late to you; you are late on ${rupees(lateOut)}.`}>
            <defs>
              <linearGradient id="late-zone" x1="0" x2="1">
                <stop offset="0" stopColor="var(--stamp)" stopOpacity="0.1" />
                <stop offset="1" stopColor="var(--stamp)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <rect x={layout.gutter} y={0} width={layout.zero - layout.gutter} height={layout.height} rx={14} fill="url(#late-zone)" />
            <text x={layout.gutter + 10} y={18} fill="var(--stamp)" style={{ font: "600 11px var(--font-hind)", letterSpacing: "0.1em" }}>
              ← LATE
            </text>
            <text x={width - 10} y={18} textAnchor="end" fill="var(--ink-3)" style={{ font: "600 11px var(--font-hind)", letterSpacing: "0.1em" }}>
              COMING UP →
            </text>

            {/* axis */}
            <line x1={layout.gutter} x2={width} y1={layout.axisY} y2={layout.axisY} stroke="var(--rule-2)" strokeWidth={1.5} />
            {ticks.map((t) => (
              <g key={t}>
                <line x1={layout.x(t)} x2={layout.x(t)} y1={layout.axisY - 4} y2={layout.axisY + 4} stroke="var(--ink-4)" strokeWidth={1.2} />
                {t !== 0 && (
                  <text x={layout.x(t)} y={layout.axisY + 16} textAnchor="middle" fill="var(--ink-4)" style={{ font: "500 10.5px var(--font-plex-mono)" }}>
                    {tickLabel(t)}
                  </text>
                )}
              </g>
            ))}
            <line x1={layout.zero} x2={layout.zero} y1={26} y2={layout.height - 6} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 4" />
            <g transform={`translate(${layout.zero}, 26)`}>
              <rect x={-26} y={-11} width={52} height={20} rx={10} fill="var(--ink)" />
              <text textAnchor="middle" y={3.5} fill="var(--sheet)" style={{ font: "700 11px var(--font-hind)" }}>
                Today
              </text>
            </g>

            {/* which side is which */}
            <text x={0} y={layout.axisY - 22} fill="var(--neem)" style={{ font: "700 11.5px var(--font-hind)" }}>
              Owed
            </text>
            <text x={0} y={layout.axisY - 8} fill="var(--neem)" style={{ font: "700 11.5px var(--font-hind)" }}>
              to you ↑
            </text>
            <text x={0} y={layout.axisY + 18} fill="var(--ink-2)" style={{ font: "700 11.5px var(--font-hind)" }}>
              You
            </text>
            <text x={0} y={layout.axisY + 32} fill="var(--ink-2)" style={{ font: "700 11.5px var(--font-hind)" }}>
              owe ↓
            </text>

            {layout.placed.map((p, i) => {
              const cy = layout.axisY + p.y;
              const dim = hover && hover !== p.slip.id;
              return (
                <motion.g
                  key={p.slip.id}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: dim ? 0.35 : 1, scale: 1 }}
                  transition={{ delay: hover ? 0 : 0.05 + i * 0.03, type: "spring", stiffness: 300, damping: 18 }}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(p.slip.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(p.slip.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => openSlip(p.slip.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openSlip(p.slip.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.dir === "in" ? `${p.slip.debtor.name} owes you` : `You owe ${p.slip.creditor.name}`} ${rupees(p.slip.amount)}, ${p.slip.daysToDue < 0 ? `${-p.slip.daysToDue} days late` : `due ${prettyDay(p.slip.dueDate, false)}`}`}
                >
                  <line x1={p.x} x2={p.x} y1={layout.axisY} y2={cy} stroke={p.color} strokeOpacity={0.35} strokeWidth={1.2} />
                  <circle cx={p.x} cy={cy} r={p.r} fill={`color-mix(in oklab, ${p.color} 20%, var(--sheet))`} stroke={p.color} strokeWidth={2} />
                  {p.r >= 17 && (
                    <text x={p.x} y={cy + 4} textAnchor="middle" fill={p.color} style={{ font: `700 ${p.r >= 24 ? 12 : 10.5}px var(--font-anek)` }}>
                      {rupeesShort(p.slip.amount).replace("₹", "")}
                    </text>
                  )}
                </motion.g>
              );
            })}
          </svg>
        )}

        {hovered && (
          <div
            className="pointer-events-none absolute z-10 w-60 -translate-x-1/2 rounded-xl border border-rule bg-sheet p-3 shadow-[var(--shadow-lift)]"
            style={{
              left: Math.min(Math.max(hovered.x, 124), width - 124),
              top: layout.axisY + hovered.y + (hovered.dir === "in" ? hovered.r + 10 : -hovered.r - 10),
              transform: `translate(-50%, ${hovered.dir === "in" ? "0" : "-100%"})`,
            }}
          >
            <p className="text-[13px] font-semibold text-ink">
              {hovered.dir === "in" ? `${hovered.slip.debtor.name} owes you` : `You owe ${hovered.slip.creditor.name}`}
            </p>
            <p className="display text-[20px] font-bold" style={{ color: hovered.color }}>
              {rupees(hovered.slip.amount)}
            </p>
            <p className="text-[12px] text-ink-3">
              {hovered.slip.note ? `${hovered.slip.note} · ` : ""}
              {hovered.slip.daysToDue < 0 ? (
                <span className="font-semibold text-stamp">{spanLabel(-hovered.slip.daysToDue)} late</span>
              ) : hovered.slip.daysToDue === 0 ? (
                "due today"
              ) : (
                `due ${prettyDay(hovered.slip.dueDate, false)}`
              )}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-3">
        <Key color="var(--stamp)" label="Late" />
        <Key color="var(--haldi)" label="Due this week" />
        <Key color="var(--neem)" label="Coming to you" />
        <Key color="var(--ink-2)" label="You'll pay" />
        <span className={clsx("ml-auto", !open.length && "hidden")}>Bigger bubble, bigger amount · tap one to open it</span>
      </div>
    </div>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full border-2" style={{ borderColor: color, background: `color-mix(in oklab, ${color} 20%, var(--sheet))` }} />
      {label}
    </span>
  );
}
