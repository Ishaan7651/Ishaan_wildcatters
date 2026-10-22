"use client";

import { useSyncExternalStore } from "react";

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  if (cachedVoice !== undefined && cachedVoice !== null) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  cachedVoice =
    voices.find((v) => v.lang === "en-IN" && /natural|neural|online/i.test(v.name)) ??
    voices.find((v) => v.lang === "en-IN") ??
    voices.find((v) => v.lang.startsWith("en-GB")) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null;
  return cachedVoice;
}

export function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Whether something is being read aloud right now, for "speaking" indicators.
let current: SpeechSynthesisUtterance | null = null;
const listeners = new Set<() => void>();
function setCurrent(u: SpeechSynthesisUtterance | null) {
  current = u;
  listeners.forEach((l) => l());
}

export function useSpeaking() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current !== null,
    () => false,
  );
}

export function speak(text: string, onEnd?: () => void) {
  if (!canSpeak() || !text) return;
  window.speechSynthesis.cancel();
  // Read "₹18,500" as "18,500 rupees" — more natural than "rupee sign".
  const spoken = text.replace(/₹\s?([\d,]+(?:\.\d+)?)/g, "$1 rupees").replace(/\bSKH-([0-9A-F]{4})\b/g, "slip $1");
  const u = new SpeechSynthesisUtterance(spoken);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = v?.lang ?? "en-IN";
  u.rate = 1.03;
  u.pitch = 1;
  u.onstart = () => setCurrent(u);
  // A cancelled utterance ends after the next one may have started.
  u.onend = u.onerror = () => {
    if (current === u) setCurrent(null);
    if (onEnd) onEnd();
  };
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
  setCurrent(null);
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = undefined;
  };
}
