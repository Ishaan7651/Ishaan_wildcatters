"use client";

/**
 * Small synthesized alert sounds — no audio files. Browsers only allow sound
 * after the person has interacted with the page, so the context is unlocked on
 * the first tap or key press and anything earlier plays silently.
 */

export type SoundKind = "request" | "good" | "warn" | "bad" | "pop";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

if (typeof window !== "undefined") {
  const unlock = () => {
    audio()?.resume().catch(() => {});
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

/** One struck note: a sine with a bright partial, quick attack, long ring-out. */
function bell(c: AudioContext, freq: number, at: number, dur = 0.9, gain = 0.22) {
  const out = c.createGain();
  out.gain.setValueAtTime(0, at);
  out.gain.linearRampToValueAtTime(gain, at + 0.008);
  out.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  out.connect(c.destination);
  for (const [mult, g] of [
    [1, 1],
    [2.76, 0.28],
    [5.4, 0.08],
  ]) {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = "sine";
    o.frequency.value = freq * mult;
    og.gain.value = g;
    o.connect(og).connect(out);
    o.start(at);
    o.stop(at + dur);
  }
}

// Notes (Hz) for each kind of alert.
const TUNES: Record<SoundKind, [number, number][]> = {
  // a temple-bell "ting-ting": someone needs your yes
  request: [
    [1318.5, 0],
    [1760, 0.14],
  ],
  // rising: confirmed, paid
  good: [
    [880, 0],
    [1108.7, 0.09],
    [1318.5, 0.18],
  ],
  // a reminder or nudge
  warn: [
    [987.8, 0],
    [987.8, 0.16],
  ],
  // falling: a point lost, a dispute
  bad: [
    [659.3, 0],
    [523.3, 0.15],
  ],
  pop: [[1568, 0]],
};

export function playSound(kind: SoundKind) {
  const c = audio();
  if (!c || c.state !== "running") return;
  const t = c.currentTime + 0.02;
  for (const [f, dt] of TUNES[kind]) bell(c, f, t + dt, kind === "pop" ? 0.35 : 0.9, kind === "bad" ? 0.26 : 0.2);
}
