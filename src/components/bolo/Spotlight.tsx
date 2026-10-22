"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Mic, Square, X } from "lucide-react";
import type { BoloResult } from "@/lib/shared/types";
import { istDay } from "@/lib/shared/dates";
import { useAppState } from "@/lib/client/api";
import { stopSpeaking, useSpeaking } from "@/lib/client/speak";
import { useApp, type Turn } from "@/components/providers/Providers";
import { Button } from "@/components/ui/primitives";
import { AgentTrace } from "./Thread";
import { TurnResult } from "./results";

/** Results that still wait on a tap — closing them leaves the draft in the thread. */
function waitsOnYou(turn: Turn) {
  const r = turn.result as BoloResult | undefined;
  if (!r || turn.outcome) return false;
  return r.kind === "slip_draft" || r.kind === "payment_draft" || r.kind === "reminder_draft" || (r.kind === "response" && !r.applied);
}

/**
 * Spoken requests are answered up top, in a pop-up, instead of further down the
 * thread — so a slip from "I owe him 20,000" and its Send button are right in
 * front of you, and a spoken answer is there to read as well as hear.
 */
export function Spotlight() {
  const { turns, spotlightId, setSpotlight, actorId, slipId, composer, diaryOpen } = useApp();
  const { data: s } = useAppState(actorId);
  const turn = turns.find((t) => t.id === spotlightId && t.actorId === actorId);
  const panelRef = useRef<HTMLElement>(null);
  const close = () => setSpotlight(null);
  const open = !!turn;
  // Escape belongs to a slip or form opened on top of the pop-up first.
  const covered = !!slipId || !!composer || diaryOpen;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || covered) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSpotlight(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, covered, setSpotlight]);

  useEffect(() => {
    if (spotlightId) panelRef.current?.focus({ preventScroll: true });
  }, [spotlightId]);

  // Following a link out of the pop-up ("Full record") leaves it behind.
  const path = usePathname();
  const pathRef = useRef(path);
  useEffect(() => {
    if (pathRef.current === path) return;
    pathRef.current = path;
    setSpotlight(null);
  }, [path, setSpotlight]);

  // Discarding is the end of it; the thread keeps the note.
  const discarded = turn?.outcome?.kind === "discarded";
  useEffect(() => {
    if (!discarded) return;
    const t = setTimeout(() => setSpotlight(null), 700);
    return () => clearTimeout(t);
  }, [discarded, setSpotlight]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {turn && (
        <div key="spotlight" className="spotlight fixed inset-0 z-[58] overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label="Your spoken request">
          <motion.div
            className="fixed inset-0 bg-[rgb(var(--shadow-rgb)/0.4)] backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <div className="pointer-events-none relative flex min-h-full items-start justify-center px-3 pt-3 pb-6 sm:pt-[76px]">
            <motion.section
              key={turn.id}
              ref={panelRef}
              tabIndex={-1}
              initial={{ opacity: 0, y: -40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -24, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              className="pointer-events-auto relative w-full max-w-[660px] overflow-clip rounded-[28px] border border-rule bg-paper shadow-[0_30px_80px_-24px_rgb(var(--shadow-rgb)/0.55)] outline-none"
            >
              <Heard turn={turn} onClose={close} />
              <div className="space-y-4 px-4 pt-4 pb-5 sm:px-6">
                <AgentTrace turn={turn} />
                {turn.status === "running" && !turn.result && <Writing />}
                {turn.status === "error" && (
                  <p className="rounded-xl border border-stamp/30 bg-stamp-soft px-4 py-3 text-[14px] text-ink">{turn.error}</p>
                )}
                {turn.result && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                    <TurnResult turn={turn} today={s?.clock.today ?? istDay()} />
                  </motion.div>
                )}
              </div>
              {turn.status !== "running" && (
                <div className="flex items-center justify-end gap-3 border-t border-rule bg-sheet-2/70 px-4 py-3 sm:px-6">
                  {waitsOnYou(turn) && <span className="mr-auto text-[12.5px] text-ink-3">Not sent yet — it stays in your conversation.</span>}
                  <Button variant={waitsOnYou(turn) ? "ghost" : "secondary"} size="sm" onClick={close}>
                    {waitsOnYou(turn) ? "Later" : "Done"}
                  </Button>
                </div>
              )}
            </motion.section>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** The marigold header: what you said, and whether the answer is being read out. */
function Heard({ turn, onClose }: { turn: Turn; onClose: () => void }) {
  const speaking = useSpeaking();
  return (
    <header className="relative overflow-hidden border-b border-dashed border-genda-2/50 bg-genda-soft px-4 pt-3.5 pb-4 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-16 size-56 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--genda) 45%, transparent), transparent 68%)" }}
      />
      <div className="relative flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-genda text-on-genda shadow-[0_2px_0_var(--genda-2)]">
          <Mic size={17} strokeWidth={2.4} />
        </span>
        <p className="eyebrow">You said</p>
        <span className="flex-1" />
        {speaking && (
          <button
            onClick={stopSpeaking}
            className="flex items-center gap-2 rounded-full bg-sheet/80 py-1 pr-2.5 pl-3 text-[12px] font-semibold text-mor-ink shadow-sm hover:bg-sheet"
            aria-label="Stop reading aloud"
          >
            <span className="flex h-3.5 items-center gap-[2px]" aria-hidden>
              {[0, 0.2, 0.4, 0.1].map((d, i) => (
                <span key={i} className="h-full w-[3px] origin-center rounded-full bg-mor" style={{ animation: `talk 0.8s ${d}s ease-in-out infinite` }} />
              ))}
            </span>
            Reading aloud
            <Square size={10} fill="currentColor" />
          </button>
        )}
        <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-sheet/70 hover:text-ink" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <p className="hand relative mt-2 text-[24px] leading-snug text-ink sm:text-[28px]">“{turn.utterance}”</p>
    </header>
  );
}

/** A blank parchi being filled while the agents work. */
function Writing() {
  return (
    <div className="space-y-3 rounded-[20px] border border-dashed border-rule-2 bg-sheet p-5" aria-label="Working on it">
      <div className="h-4 w-32 skeleton" />
      <div className="h-9 w-3/4 skeleton" />
      <div className="h-4 w-1/2 skeleton" />
      <div className="mt-2 h-24 skeleton" />
    </div>
  );
}
