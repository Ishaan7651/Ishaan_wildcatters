"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useInView, useMotionValueEvent, useReducedMotion, useSpring } from "motion/react";
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
const MAX_COINS = PER_COLUMN * 3;
/** How long a coin takes to fall into its pan; the beam answers when it lands. */
const LAND = 300;
/** Extra tilt while you hover one side's total, as if pressing that pan. */
const PRESS = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Heavier side goes down: lena-heavy tips the left pan down (anticlockwise).
function tiltFor(lena: number, dena: number) {
  const total = lena + dena;
  const ratio = total ? (lena - dena) / total : 0;
  return -Math.sign(ratio) * Math.pow(Math.abs(ratio), 0.7) * MAX_TILT;
}

// Coins go in turn about, so the beam seesaws while the pans fill.
function nextDrop(d: { lena: number; dena: number }, lenaMax: number, denaMax: number) {
  const lena = Math.min(d.lena, lenaMax);
  const dena = Math.min(d.dena, denaMax);
  if (lena < lenaMax && (lena <= dena || dena >= denaMax)) return { lena: lena + 1, dena };
  return { lena, dena: dena + 1 };
}

/**
 * The taraazu — every shop's balance scale. Lena (owed to you) sits in the
 * left pan, dena (what you owe) in the right. One coin per open slip drops in,
 * side by side, and the beam weighs them as they land; red coins are overdue.
 * Tap the scale to weigh again.
 */
export function Taraazu({ stats }: { stats: ProfileStats }) {
  const reduce = useReducedMotion();
  // Start weighing once the scale is on screen, so nobody misses it.
  const ref = useRef<HTMLButtonElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  const onScreen = useInView(ref, { amount: 0.1 });
  const lena = stats.owed.amount;
  const dena = stats.owes.amount;
  const total = lena + dena;
  const net = lena - dena;
  const lenaShown = Math.min(stats.owed.count, MAX_COINS);
  const denaShown = Math.min(stats.owes.count, MAX_COINS);

  // Coins dropped so far, per pan.
  const [drop, setDrop] = useState({ lena: 0, dena: 0 });
  const lenaIn = Math.min(drop.lena, lenaShown);
  const denaIn = Math.min(drop.dena, denaShown);
  const full = lenaIn >= lenaShown && denaIn >= denaShown;
  const gap = clamp(1600 / Math.max(1, lenaShown + denaShown), 70, 240);
  useEffect(() => {
    if (full || !seen) return;
    const t = setTimeout(() => setDrop((d) => (reduce ? { lena: lenaShown, dena: denaShown } : nextDrop(d, lenaShown, denaShown))), reduce ? 0 : gap);
    return () => clearTimeout(t);
  }, [drop, full, seen, gap, lenaShown, denaShown, reduce]);

  // The money that has landed, as a share of each side's total.
  const lenaLanded = lenaShown ? (lena * lenaIn) / lenaShown : lena;
  const denaLanded = denaShown ? (dena * denaIn) / denaShown : dena;

  // Weigh each coin when it lands, not when it starts to fall. Timers aren't
  // cancelled on the next drop, or a quick run of coins would never move the beam.
  const [weighed, setWeighed] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    timers.current.push(setTimeout(() => setWeighed(tiltFor(lenaLanded, denaLanded)), reduce ? 0 : LAND));
  }, [lenaLanded, denaLanded, reduce]);

  const [press, setPress] = useState<-1 | 0 | 1>(0);
  const spring = useSpring(0, { stiffness: 70, damping: 8, mass: 1.1 });
  useEffect(() => {
    const to = clamp(weighed + press * PRESS, -MAX_TILT - PRESS, MAX_TILT + PRESS);
    if (reduce) spring.jump(to);
    else spring.set(to);
  }, [weighed, press, reduce, spring]);

  // The pans hang on strings, so they swing a little against the beam's motion.
  const [pose, setPose] = useState({ angle: 0, swing: 0 });
  useMotionValueEvent(spring, "change", (angle) => setPose({ angle, swing: clamp(-spring.getVelocity() * 0.09, -9, 9) }));
  useMotionValueEvent(spring, "animationComplete", () => setPose((p) => ({ ...p, swing: 0 })));

  // Never quite still: a slow breath in the beam and a lazy sway in the pans,
  // from two out-of-step sines so it doesn't look like a loop. Paused off screen.
  const [t, setT] = useState(0);
  useEffect(() => {
    if (reduce || !onScreen) return;
    const t0 = performance.now() - t * 1000;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      setT((now - t0) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, onScreen]);
  const breathe = Math.sin(t * 1.15) * 1.3 + Math.sin(t * 0.47 + 1) * 0.8;
  const sway = Math.sin(t * 1.6 + 0.5) * 2.4 + Math.sin(t * 0.7) * 1.2;
  const angle = pose.angle + breathe;

  const rad = (angle * Math.PI) / 180;
  const left = { x: PX - ARM * Math.cos(rad), y: PY - ARM * Math.sin(rad) };
  const right = { x: PX + ARM * Math.cos(rad), y: PY + ARM * Math.sin(rad) };

  const label =
    total === 0
      ? "The scale is empty: nobody owes you and you owe nobody."
      : `Owed to you ${rupees(lena)}, you owe ${rupees(dena)}. The scale tips toward ${net >= 0 ? "what you're owed" : "what you owe"}.`;

  return (
    <div>
      <button
        ref={ref}
        type="button"
        onClick={() => setDrop({ lena: 0, dena: 0 })}
        className="block w-full cursor-pointer rounded-2xl"
        title="Weigh again"
        aria-label={`${label} Weigh again.`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" aria-hidden>
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

          <Pan at={left} swing={pose.swing + sway} shown={lenaShown} dropped={lenaIn} extra={stats.owed.count - lenaShown} overdue={stats.owed.overdueCount} side="lena" />
          <Pan at={right} swing={pose.swing - sway * 0.8} shown={denaShown} dropped={denaIn} extra={stats.owes.count - denaShown} overdue={stats.owes.overdueCount} side="dena" />
        </svg>
      </button>

      <div className="mt-1 grid grid-cols-2 gap-3">
        <PanLabel
          href="/bahi?side=lena"
          title="Owed to you"
          amount={lenaLanded}
          detail={`${stats.owed.count} slip${stats.owed.count === 1 ? "" : "s"}${stats.owed.overdueCount ? ` · ${stats.owed.overdueCount} late` : ""}`}
          late={stats.owed.overdueCount > 0}
          tone="var(--neem)"
          onPress={(on) => setPress(on ? -1 : 0)}
        />
        <PanLabel
          href="/bahi?side=dena"
          title="You owe"
          amount={denaLanded}
          detail={`${stats.owes.count} slip${stats.owes.count === 1 ? "" : "s"}${stats.owes.overdueCount ? ` · ${stats.owes.overdueCount} late` : ""}`}
          late={stats.owes.overdueCount > 0}
          tone="var(--ink)"
          onPress={(on) => setPress(on ? 1 : 0)}
          right
        />
      </div>
      <p className="mt-3 rounded-xl bg-paper-deep/70 px-3 py-2 text-center text-[13px] text-ink-2">
        {total === 0 ? (
          "Nothing on the scale yet."
        ) : (
          <>
            <b className={net >= 0 ? "text-neem" : "text-stamp"}>
              {net >= 0 ? "+" : "−"}
              {rupees(Math.abs(net))}
            </b>{" "}
            net
          </>
        )}
      </p>
    </div>
  );
}

function Pan({
  at,
  swing,
  shown,
  dropped,
  extra,
  overdue,
  side,
}: {
  at: { x: number; y: number };
  swing: number;
  shown: number;
  dropped: number;
  extra: number;
  overdue: number;
  side: "lena" | "dena";
}) {
  const drop = 74;
  const half = 58;
  const rimY = at.y + drop;
  const cols = Math.max(1, Math.ceil(shown / PER_COLUMN));
  const colX = (c: number) => at.x + (c - (cols - 1) / 2) * 34;
  // Overdue coins sit on top of each column so they're the first thing you see.
  const lateFrom = shown - Math.min(overdue, shown);
  return (
    <g transform={`rotate(${swing} ${at.x} ${at.y})`}>
      {/* strings */}
      <line x1={at.x} y1={at.y} x2={at.x - half + 6} y2={rimY} stroke="var(--ink-3)" strokeWidth={1.3} />
      <line x1={at.x} y1={at.y} x2={at.x + half - 6} y2={rimY} stroke="var(--ink-3)" strokeWidth={1.3} />
      <circle cx={at.x} cy={at.y} r={4} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={2} />
      {/* coins, falling in one at a time */}
      {Array.from({ length: dropped }, (_, i) => {
        const cx = colX(Math.floor(i / PER_COLUMN));
        const cy = rimY - 4 - (i % PER_COLUMN) * 7.5;
        const late = i >= lateFrom;
        return (
          <g key={`${side}-${i}`} style={{ animation: `coin-drop ${LAND + 120}ms both` }}>
            <ellipse cx={cx} cy={cy + 3} rx={15.5} ry={5} fill={late ? "color-mix(in oklab, var(--stamp) 70%, black)" : "var(--genda-ink)"} />
            <ellipse cx={cx} cy={cy} rx={15.5} ry={5} fill={late ? "var(--stamp)" : "var(--genda)"} stroke={late ? "color-mix(in oklab, var(--stamp) 60%, black)" : "var(--genda-ink)"} strokeWidth={0.8} />
          </g>
        );
      })}
      {extra > 0 && dropped >= shown && (
        <text x={at.x} y={rimY - 4 - PER_COLUMN * 7.5 - 6} textAnchor="middle" fill="var(--ink-3)" style={{ font: "600 11px var(--font-hind)", animation: "tick-in 300ms both" }}>
          +{extra}
        </text>
      )}
      {/* bowl */}
      <path d={`M ${at.x - half} ${rimY} Q ${at.x} ${rimY + 30} ${at.x + half} ${rimY} Z`} fill={side === "lena" ? "var(--neem-soft)" : "var(--paper-deep)"} stroke="var(--ink)" strokeWidth={2.2} strokeLinejoin="round" />
      <line x1={at.x - half - 3} y1={rimY} x2={at.x + half + 3} y2={rimY} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

function PanLabel({
  href,
  title,
  amount,
  detail,
  late,
  tone,
  onPress,
  right,
}: {
  href: string;
  title: string;
  amount: number;
  detail: string;
  late: boolean;
  tone: string;
  onPress: (on: boolean) => void;
  right?: boolean;
}) {
  return (
    <Link
      href={href}
      onPointerEnter={() => onPress(true)}
      onPointerLeave={() => onPress(false)}
      onFocus={() => onPress(true)}
      onBlur={() => onPress(false)}
      className={`group rounded-xl px-2 py-1 transition-colors hover:bg-sheet-2 ${right ? "text-right" : ""}`}
    >
      <span className="block text-[12.5px] font-semibold text-ink-2">{title}</span>
      <span className="display block text-[25px] leading-tight font-bold" style={{ color: tone }}>
        <Ticker value={amount} format={(n) => rupees(n)} />
      </span>
      <span className={`block text-[12px] ${late ? "font-medium text-stamp" : "text-ink-3"} group-hover:underline`}>{detail}</span>
    </Link>
  );
}
