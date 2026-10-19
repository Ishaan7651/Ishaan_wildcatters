"use client";

import { AnimatePresence, motion } from "motion/react";
import { AGENTS, AGENT_ORDER } from "@/lib/shared/agents";
import { istTime } from "@/lib/shared/dates";
import { useAgents } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { AgentGlyph } from "@/components/ui/primitives";

/**
 * The crew, docked in the corner. Shows who is working right now (or what
 * they did last) and opens the full diary on click — so the diary is one tap
 * away without taking a whole column of the screen.
 */
export function CrewDock() {
  const { turns, setDiaryOpen } = useApp();
  const { data } = useAgents(6);
  const live = turns.find((t) => t.status === "running");
  const step = live?.steps[live.steps.length - 1];
  const activeAgent = step?.agent ?? (live ? "sutradhar" : null);
  const last = data?.runs[0];

  return (
    <button
      onClick={() => setDiaryOpen(true)}
      className="group fixed right-5 bottom-5 z-30 hidden max-w-[360px] items-center gap-3 rounded-full border border-rule bg-sheet/95 py-1.5 pr-4 pl-1.5 text-left shadow-[var(--shadow-lift)] backdrop-blur-md transition-transform hover:-translate-y-0.5 md:flex"
      aria-label="Open the agents' diary"
    >
      <AnimatePresence mode="wait" initial={false}>
        {activeAgent ? (
          <motion.span key="live" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="relative grid size-10 place-items-center">
            <span className="absolute inset-0 rounded-full" style={{ background: AGENTS[activeAgent].color, opacity: 0.25, animation: "pulse-ring 1.4s ease-out infinite" }} />
            <AgentGlyph agent={activeAgent} size={38} />
          </motion.span>
        ) : (
          <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex -space-x-2.5 pl-0.5">
            {AGENT_ORDER.map((a, i) => (
              <span key={a} className="rounded-full ring-2 ring-sheet transition-transform group-hover:-translate-y-0.5" style={{ transitionDelay: `${i * 30}ms` }}>
                <AgentGlyph agent={a} size={30} />
              </span>
            ))}
          </motion.span>
        )}
      </AnimatePresence>
      <span className="hidden min-w-0 leading-tight xl:block">
        {activeAgent ? (
          <>
            <span className="block text-[13px] font-semibold text-ink">
              {AGENTS[activeAgent].title} is working<span className="writing-dot">…</span>
            </span>
            <span className="block truncate text-[11.5px] text-ink-3">{step ? step.label : "reading what you said"}</span>
          </>
        ) : (
          <>
            <span className="block text-[13px] font-semibold text-ink">The crew</span>
            <span className="block max-w-[210px] truncate text-[11.5px] text-ink-3">
              {last ? `${istTime(last.startedAt)} · ${AGENTS[last.agent].title}: ${last.summary}` : "Six agents keeping your ledger"}
            </span>
          </>
        )}
      </span>
    </button>
  );
}
