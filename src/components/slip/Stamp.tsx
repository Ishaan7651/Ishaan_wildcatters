"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { prettyDay } from "@/lib/shared/dates";

export type StampKind = "confirmed" | "paid" | "disputed" | "countered" | "withdrawn";

const STAMPS: Record<StampKind, { en: string; hi: string; color: string }> = {
  confirmed: { en: "CONFIRMED", hi: "स्वीकृत", color: "var(--mor)" },
  paid: { en: "PAID", hi: "चुकता", color: "var(--neem)" },
  disputed: { en: "DISPUTED", hi: "विवादित", color: "var(--stamp)" },
  countered: { en: "REVISION ASKED", hi: "संशोधन", color: "var(--haldi-ink)" },
  withdrawn: { en: "CANCELLED", hi: "रद्द", color: "var(--ink-3)" },
};

/** A rubber stamp, slammed onto the slip when both sides agree (or don't). */
export function Stamp({ kind, date, animate = true, scale = 1 }: { kind: StampKind; date?: string; animate?: boolean; scale?: number }) {
  const id = useId().replace(/:/g, "");
  const s = STAMPS[kind];
  const w = 176 * scale;
  const h = 78 * scale;
  return (
    <motion.div
      aria-label={`Stamped ${s.en.toLowerCase()}`}
      initial={animate ? { scale: 1.8, opacity: 0, rotate: -18 } : false}
      animate={{ scale: 1, opacity: 0.9, rotate: -8 }}
      transition={{ type: "spring", stiffness: 520, damping: 20, mass: 0.9 }}
      style={{ width: w, height: h, color: s.color }}
      className="pointer-events-none select-none"
    >
      <svg width={w} height={h} viewBox="0 0 176 78">
        <defs>
          <filter id={`ink-${id}`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.55" result="speckle" />
            <feComposite in="SourceGraphic" in2="speckle" operator="in" />
          </filter>
        </defs>
        <g filter={`url(#ink-${id})`} fill="none" stroke="currentColor">
          <rect x="3" y="3" width="170" height="72" rx="10" strokeWidth="3.2" />
          <rect x="9" y="9" width="158" height="60" rx="6" strokeWidth="1.3" />
          <text
            x="88"
            y="37"
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            style={{ font: `700 ${kind === "countered" ? 17 : 22}px var(--font-anek)`, letterSpacing: "0.08em", fontStretch: "80%" }}
          >
            {s.en}
          </text>
          <text x="88" y="58" textAnchor="middle" fill="currentColor" stroke="none" style={{ font: "600 14px var(--font-anek-deva)" }}>
            {s.hi}
            {date ? `  ·  ${prettyDay(date, false)}` : ""}
          </text>
        </g>
      </svg>
    </motion.div>
  );
}
