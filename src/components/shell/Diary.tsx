"use client";

import { useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { Brain, CheckCheck, ChevronRight, Forward, MessageSquare, PenLine, TriangleAlert, Waypoints, Wrench } from "lucide-react";
import type { AgentRun, AgentStep, StepKind } from "@/lib/shared/types";
import { AGENTS } from "@/lib/shared/agents";
import { istDay, istTime, prettyDay, diffDays } from "@/lib/shared/dates";
import { useAgents, useAppState } from "@/lib/client/api";
import { useApp, type Turn } from "@/components/providers/Providers";
import { AgentGlyph } from "@/components/ui/primitives";

export const STEP_ICON: Record<StepKind, typeof Brain> = {
  route: Waypoints,
  tool: Wrench,
  think: Brain,
  write: PenLine,
  say: MessageSquare,
  handoff: Forward,
  result: CheckCheck,
  error: TriangleAlert,
};

export function StepLine({ step, compact }: { step: AgentStep; compact?: boolean }) {
  const Icon = STEP_ICON[step.kind];
  return (
    <div className={clsx("flex items-start gap-2", compact ? "py-0.5" : "py-1")}>
      <Icon size={13} className={clsx("mt-[3px] shrink-0", step.kind === "error" ? "text-stamp" : "text-ink-4")} style={step.kind !== "error" ? { color: AGENTS[step.agent].color, opacity: 0.8 } : undefined} />
      <div className="min-w-0 text-[12.5px] leading-snug">
        <span className={clsx("font-mono text-[11.5px]", step.kind === "error" ? "text-stamp" : "text-ink")}>{step.label}</span>
        {step.detail && <span className="text-ink-3"> — {step.detail}</span>}
      </div>
    </div>
  );
}

export function Diary({ embedded = false, limit = 40, agent }: { embedded?: boolean; limit?: number; agent?: string }) {
  const { turns, actorId } = useApp();
  const { data } = useAgents(limit, agent);
  const { data: state } = useAppState(actorId);
  const live = turns.filter((t) => t.status === "running");
  const today = state?.clock.today ?? istDay();

  const groups: { day: string; runs: AgentRun[] }[] = [];
  for (const r of data?.runs ?? []) {
    const day = istDay(r.startedAt);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.runs.push(r);
    else groups.push({ day, runs: [r] });
  }

  return (
    <div className="flex h-full flex-col">
      {!embedded && (
        <div className="border-b border-rule px-5 pt-5 pb-4">
          <h2 className="display text-[19px] font-semibold text-ink">Activity log</h2>
          <p className="text-[12.5px] text-ink-3">The agents&apos; daily diary — every step they take, as it happens.</p>
        </div>
      )}
      <div className="margin-line min-h-0 flex-1 overflow-y-auto bg-sheet pb-10 [--margin-x:62px]">
        <AnimatePresence initial={false}>
          {live.map((t) => (
            <LiveEntry key={t.id} turn={t} />
          ))}
        </AnimatePresence>
        {!data && (
          <div className="space-y-3 p-5 pl-[78px]">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-14 skeleton" />
            ))}
          </div>
        )}
        {groups.map((g) => (
          <section key={g.day}>
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-sheet/95 py-1.5 pr-4 pl-[74px] backdrop-blur-sm">
              <span className="eyebrow !text-[10px]">{dayLabel(g.day, today)}</span>
            </div>
            {g.runs.map((r) => (
              <RunEntry key={r.id} run={r} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function dayLabel(day: string, today: string) {
  const d = diffDays(today, day);
  if (d === 0) return `Today · ${prettyDay(day, false)}`;
  if (d === 1) return `Yesterday · ${prettyDay(day, false)}`;
  return prettyDay(day);
}

function RunEntry({ run }: { run: AgentRun }) {
  const [open, setOpen] = useState(false);
  const agents = [...new Set(run.steps.map((s) => s.agent))].filter((a) => a !== run.agent);
  return (
    <motion.article layout="position" className="relative grid grid-cols-[62px_1fr] border-b border-dashed border-rule pr-4 last:border-0">
      <time className="pt-3.5 pr-2 text-right font-mono text-[10.5px] text-ink-3">{istTime(run.startedAt)}</time>
      <div className="min-w-0 py-3 pl-3.5">
        <div className="flex items-center gap-2">
          <AgentGlyph agent={run.agent} size={22} />
          <span className="text-[13px] font-semibold text-ink">{AGENTS[run.agent].title}</span>
          {agents.map((a) => (
            <span key={a} className="-ml-1 opacity-80">
              <AgentGlyph agent={a} size={16} />
            </span>
          ))}
          <span className="truncate text-[11.5px] text-ink-3">· {run.trigger}</span>
          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-ink-4">{(run.durationMs / 1000).toFixed(1)}s</span>
        </div>
        <p className={clsx("mt-1 text-[13.5px] leading-snug", run.status === "error" ? "text-stamp" : "text-ink-2", !open && "line-clamp-3")}>{run.summary}</p>
        {run.steps.length > 0 && (
          <button onClick={() => setOpen((o) => !o)} className="mt-1 flex items-center gap-1 text-[11.5px] font-medium text-ink-3 hover:text-mor" aria-expanded={open}>
            <ChevronRight size={12} className={clsx("transition-transform", open && "rotate-90")} />
            {run.steps.length} step{run.steps.length === 1 ? "" : "s"}
            {run.mode === "offline" ? " · rules" : run.model ? ` · ${run.model.split("/").pop()}` : ""}
            {run.tokens ? ` · ${run.tokens.toLocaleString("en-IN")} tokens` : ""}
          </button>
        )}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-1.5 border-l border-rule-2 pl-2.5">
                {run.steps.map((s, i) => (
                  <StepLine key={i} step={s} compact />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

function LiveEntry({ turn }: { turn: Turn }) {
  const last = turn.steps[turn.steps.length - 1];
  const agent = last?.agent ?? "sutradhar";
  return (
    <motion.article
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="relative grid grid-cols-[62px_1fr] bg-mor-soft/40 pr-4"
    >
      <time className="pt-3.5 pr-2 text-right font-mono text-[10.5px] text-mor">now</time>
      <div className="min-w-0 py-3 pl-3.5">
        <div className="flex items-center gap-2">
          <AgentGlyph agent={agent} size={22} />
          <span className="text-[13px] font-semibold text-ink">{AGENTS[agent].title}</span>
          <span className="text-[11.5px] text-mor">
            is working<span className="writing-dot">…</span>
          </span>
        </div>
        <p className="hand mt-1 truncate text-[15px]">“{turn.utterance}”</p>
        <div className="mt-1 border-l border-mor/30 pl-2.5">
          {turn.steps.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}>
              <StepLine step={s} compact />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.article>
  );
}
