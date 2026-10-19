"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMotionValueEvent, useSpring } from "motion/react";
import type { ProfileStats } from "@/lib/shared/types";
import { rupees } from "@/lib/shared/money";
import { Ticker } from "@/components/ui/primitives";

const W = 400;
const H = 236;
const PX = W / 2;
const PY = 50;
const ARM = 138;
const MAX_TILT = 15;
const PER_COLUMN = 6;

/**
 * The taraazu — every shop's balance scale. Lena (owed to you) sits in the
 * left pan, dena (what you owe) in the right; the beam tips toward whichever
 * side is heavier. One coin per open slip; red coins are overdue.
 */
export function Taraazu({ stats }: { stats: ProfileStats }) {
  const lena = stats.owed.amount;
  const dena = stats.owes.amount;
  const total = lena + dena;
  const ratio = total ? (lena - dena) / total : 0;
  // Heavier side goes down: lena-heavy tips the left pan down (anticlockwise).
  const target = -Math.sign(ratio) * Math.pow(Math.abs(ratio), 0.7) * MAX_TILT;

  const spring = useSpring(0, { stiffness: 60, damping: 7, mass: 1.2 });
  const [angle, setAngle] = useState(0);
  useMotionValueEvent(spring, "change", setAngle);
  useEffect(() => {
    spring.set(target);
  }, [target, spring]);

  const rad = (angle * Math.PI) / 180;
  const left = { x: PX - ARM * Math.cos(rad), y: PY - ARM * Math.sin(rad) };
  const right = { x: PX + ARM * Math.cos(rad), y: PY + ARM * Math.sin(rad) };
  const net = lena - dena;

  const label =
    total === 0
      ? "The scale is empty: nobody owes you and you owe nobody."
      : `Owed to you ${rupees(lena)}, you owe ${rupees(dena)}. The scale tips toward ${net >= 0 ? "what you're owed" : "what you owe"}.`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={label}>
        {/* stand */}
        <path d={`M ${PX - 52} ${H - 6} Q ${PX} ${H - 26} ${PX + 52} ${H - 6} Z`} fill="var(--ink)" opacity={0.9} />
        <rect x={PX - 3.5} y={PY} width={7} height={H - PY - 16} rx={3.5} fill="var(--ink)" opacity={0.9} />
        {/* the kaanta: a needle over a little arc, reading the tilt */}
        <path d={`M ${PX - 24} ${PY - 24} A 34 34 0 0 1 ${PX + 24} ${PY - 24}`} fill="none" stroke="var(--rule-2)" strokeWidth={2} strokeLinecap="round" />
        <line x1={PX} y1={PY - 33} x2={PX} y2={PY - 39} stroke="var(--ink-3)" strokeWidth={2} strokeLinecap="round" />
        <line x1={PX} y1={PY} x2={PX} y2={PY - 30} stroke="var(--stamp)" strokeWidth={2.5} strokeLinecap="round" transform={`rotate(${angle} ${PX} ${PY})`} />

        {/* beam */}
        <line x1={left.x} y1={left.y} x2={right.x} y2={right.y} stroke="var(--ink)" strokeWidth={6} strokeLinecap="round" />
        <circle cx={PX} cy={PY} r={9} fill="var(--genda)" stroke="var(--ink)" strokeWidth={2.5} />

        <Pan at={left} count={stats.owed.count} overdue={stats.owed.overdueCount} side="lena" />
        <Pan at={right} count={stats.owes.count} overdue={stats.owes.overdueCount} side="dena" />
      </svg>

      <div className="mt-1 grid grid-cols-2 gap-3">
        <PanLabel
          href="/bahi?side=lena"
          title="Lena"
          hindi="लेना"
          sub="owed to you"
          amount={lena}
          detail={`${stats.owed.count} slip${stats.owed.count === 1 ? "" : "s"}${stats.owed.overdueCount ? ` · ${stats.owed.overdueCount} late` : ""}`}
          late={stats.owed.overdueCount > 0}
          tone="var(--neem)"
        />
        <PanLabel
          href="/bahi?side=dena"
          title="Dena"
          hindi="देना"
          sub="you owe"
          amount={dena}
          detail={`${stats.owes.count} slip${stats.owes.count === 1 ? "" : "s"}${stats.owes.overdueCount ? ` · ${stats.owes.overdueCount} late` : ""}`}
          late={stats.owes.overdueCount > 0}
          tone="var(--ink)"
          right
        />
      </div>
      <p className="mt-3 rounded-xl bg-paper-deep/70 px-3 py-2 text-center text-[13px] text-ink-2">
        {total === 0 ? (
          "Nothing on the scale yet. Say your first slip."
        ) : (
          <>
            Net{" "}
            <b className={net >= 0 ? "text-neem" : "text-stamp"}>
              {net >= 0 ? "+" : "−"}
              {rupees(Math.abs(net))}
            </b>{" "}
            {net >= 0 ? "in your favour" : "against you"}
          </>
        )}
      </p>
    </div>
  );
}

function Pan({ at, count, overdue, side }: { at: { x: number; y: number }; count: number; overdue: number; side: "lena" | "dena" }) {
  const drop = 74;
  const half = 58;
  const rimY = at.y + drop;
  const shown = Math.min(count, PER_COLUMN * 3);
  const cols = Math.max(1, Math.ceil(shown / PER_COLUMN));
  const coins = Array.from({ length: shown }, (_, i) => {
    const col = Math.floor(i / PER_COLUMN);
    const row = i % PER_COLUMN;
    // Overdue coins sit on top of each column so they're the first thing you see.
    const isLate = i >= shown - Math.min(overdue, shown);
    return { col, row, isLate };
  });
  const colX = (c: number) => at.x + (c - (cols - 1) / 2) * 34;
  return (
    <g>
      {/* strings */}
      <line x1={at.x} y1={at.y} x2={at.x - half + 6} y2={rimY} stroke="var(--ink-3)" strokeWidth={1.3} />
      <line x1={at.x} y1={at.y} x2={at.x + half - 6} y2={rimY} stroke="var(--ink-3)" strokeWidth={1.3} />
      <circle cx={at.x} cy={at.y} r={4} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={2} />
      {/* coins */}
      {coins.map((c, i) => {
        const cx = colX(c.col);
        const cy = rimY - 4 - c.row * 7.5;
        return (
          <g key={`${side}-${i}`} style={{ animation: `punch 420ms ${120 + i * 45}ms both`, transformOrigin: `${cx}px ${cy}px` }}>
            <ellipse cx={cx} cy={cy + 3} rx={15.5} ry={5} fill={c.isLate ? "color-mix(in oklab, var(--stamp) 70%, black)" : "var(--genda-ink)"} />
            <ellipse cx={cx} cy={cy} rx={15.5} ry={5} fill={c.isLate ? "var(--stamp)" : "var(--genda)"} stroke={c.isLate ? "color-mix(in oklab, var(--stamp) 60%, black)" : "var(--genda-ink)"} strokeWidth={0.8} />
          </g>
        );
      })}
      {count > shown && (
        <text x={at.x} y={rimY - 4 - PER_COLUMN * 7.5 - 6} textAnchor="middle" fill="var(--ink-3)" style={{ font: "600 11px var(--font-hind)" }}>
          +{count - shown}
        </text>
      )}
      {/* bowl */}
      <path d={`M ${at.x - half} ${rimY} Q ${at.x} ${rimY + 30} ${at.x + half} ${rimY} Z`} fill={side === "lena" ? "var(--neem-soft)" : "var(--paper-deep)"} stroke="var(--ink)" strokeWidth={2.2} strokeLinejoin="round" />
      <line x1={at.x - half - 3} y1={rimY} x2={at.x + half + 3} y2={rimY} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

function PanLabel({ href, title, hindi, sub, amount, detail, late, tone, right }: { href: string; title: string; hindi: string; sub: string; amount: number; detail: string; late: boolean; tone: string; right?: boolean }) {
  return (
    <Link href={href} className={`group rounded-xl px-2 py-1 transition-colors hover:bg-sheet-2 ${right ? "text-right" : ""}`}>
      <span className={`flex items-baseline gap-1.5 ${right ? "justify-end" : ""}`}>
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <span className="font-deva text-[12px] text-ink-4">{hindi}</span>
        <span className="text-[12px] text-ink-3">· {sub}</span>
      </span>
      <span className="display block text-[25px] leading-tight font-bold" style={{ color: tone }}>
        <Ticker value={amount} format={(n) => rupees(n)} />
      </span>
      <span className={`block text-[12px] ${late ? "font-medium text-stamp" : "text-ink-3"} group-hover:underline`}>{detail}</span>
    </Link>
  );
}
