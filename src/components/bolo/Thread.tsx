"use client";

import { useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Keyboard, Mic } from "lucide-react";
import type { AgentName } from "@/lib/shared/types";
import { AGENTS } from "@/lib/shared/agents";
import { useApp, type Turn } from "@/components/providers/Providers";
import { AgentGlyph } from "@/components/ui/primitives";
import { StepLine } from "@/components/shell/Diary";
import { TurnResult } from "./results";

export function Thread({ today }: { today: string }) {
  const { turns: all, actorId } = useApp();
  // Each business sees its own conversation; switching back brings it back.
  const turns = all.filter((t) => t.actorId === actorId);
  return (
    <div className="space-y-5">
      <AnimatePresence initial={false}>
        {turns.map((t) => (
          <motion.div
            key={t.id}
            layout="position"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <TurnCard turn={t} today={today} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function TurnCard({ turn, today }: { turn: Turn; today: string }) {
  return (
    <article className="relative">
      <div className="flex items-start gap-3 px-1">
        <span className="mt-1.5 grid size-6 shrink-0 place-items-center rounded-full bg-paper-deep text-ink-3" title={turn.source === "voice" ? "Spoken" : "Typed"}>
          {turn.source === "voice" ? <Mic size={13} /> : <Keyboard size={13} />}
        </span>
        <p className="hand min-w-0 flex-1 text-[20px] leading-snug sm:text-[22px]">“{turn.utterance}”</p>
      </div>
      <div className="mt-2 ml-4 border-l-[1.5px] border-stamp/40 pb-1 pl-5 sm:ml-[11px]">
        <AgentTrace turn={turn} />
        {turn.status === "error" && (
          <p className="mt-3 rounded-xl border border-stamp/30 bg-stamp-soft px-4 py-3 text-[14px] text-ink">{turn.error}</p>
        )}
        {turn.result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mt-3">
            <TurnResult turn={turn} today={today} />
          </motion.div>
        )}
      </div>
    </article>
  );
}

function AgentTrace({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false);
  const running = turn.status === "running";
  const chain: AgentName[] = [];
  for (const s of turn.steps) if (chain[chain.length - 1] !== s.agent) chain.push(s.agent);
  if (!chain.length) chain.push("sutradhar");
  const showSteps = running || open;
  return (
    <div className="rounded-2xl border border-rule bg-sheet-2/70 px-3.5 py-2.5">
      <button onClick={() => !running && setOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left" aria-expanded={showSteps}>
        {chain.map((a, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-ink-4">→</span>}
            <AgentGlyph agent={a} size={22} className={clsx(running && i === chain.length - 1 && "animate-pulse")} />
            <span className="text-[13px] font-semibold text-ink">{AGENTS[a].title}</span>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-3">
          {running ? (
            <>
              working<span className="writing-dot">…</span>
            </>
          ) : (
            <>
              {turn.steps.length} steps · {((turn.ms ?? 0) / 1000).toFixed(1)}s{turn.mode === "offline" ? " · rules" : ""}
              <ChevronRight size={13} className={clsx("transition-transform", open && "rotate-90")} />
            </>
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {showSteps && turn.steps.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 border-t border-rule pt-1.5">
              {turn.steps.map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
                  <StepLine step={s} compact />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
