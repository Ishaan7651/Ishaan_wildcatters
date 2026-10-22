"use client";

import { useState } from "react";
import clsx from "clsx";
import { Footprints } from "lucide-react";
import type { AgentName } from "@/lib/shared/types";
import { AGENTS, AGENT_ORDER } from "@/lib/shared/agents";
import { istDay, istTime, prettyDay } from "@/lib/shared/dates";
import { postJSON, useAgents } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { Diary } from "@/components/shell/Diary";
import { AgentGlyph, Button } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AgentsPage() {
  const { data } = useAgents(80);
  const { toast, refreshAll } = useApp();
  const [filter, setFilter] = useState<AgentName | null>(null);
  const [patrolling, setPatrolling] = useState(false);

  const patrol = async () => {
    setPatrolling(true);
    try {
      const r = await postJSON<{ run: { summary: string } }>("/api/agents/patrol", {});
      toast({ agent: "chowkidar", title: "Patrol done", body: r.run.summary });
      await refreshAll();
    } catch (e) {
      toast({ title: "Patrol failed", body: (e as Error).message, tone: "bad" });
    } finally {
      setPatrolling(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader title="Agents">
        Six helpers. They propose — the rules decide.
      </PageHeader>

      {data && (
        <div className={clsx("mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-[13.5px]", data.ai.mode === "ai" ? "border-neem/30 bg-neem-soft/50 text-ink" : "border-haldi/50 bg-haldi-soft/60 text-ink")}>
          <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", data.ai.mode === "ai" ? "bg-neem" : "bg-haldi")} />
          {data.ai.mode === "ai" ? (
            <span>
              Running on <b>OpenRouter</b> · <span className="font-mono text-[12.5px]">{data.ai.model}</span> · tool-calling agents with a rules fallback if the model is unreachable.
            </span>
          ) : (
            <span>
              <b>Rules mode.</b> No OpenRouter key is set, so the agents use the built-in rules engine. Add <code className="font-mono text-[12.5px]">OPENROUTER_API_KEY</code> to <code className="font-mono text-[12.5px]">.env.local</code> and restart to switch the AI on.
            </span>
          )}
        </div>
      )}

      <Flow />

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AGENT_ORDER.map((name) => {
          const a = AGENTS[name];
          const st = data?.stats.find((s) => s.name === name);
          return (
            <article key={name} className="sheet flex flex-col overflow-hidden p-5 pt-6" style={{ boxShadow: `inset 0 4px 0 ${a.color}, var(--shadow-sheet)` }}>
              <div className="flex items-start gap-3.5">
                <AgentGlyph agent={name} size={48} />
                <div className="min-w-0 flex-1">
                  <h3 className="display flex items-baseline gap-2 text-[21px] font-semibold text-ink">
                    {a.title}
                  </h3>
                  <p className="text-[13px] font-medium" style={{ color: a.color }}>
                    {a.role}
                  </p>
                </div>
              </div>
              <ul className="mt-4 flex-1 space-y-1.5 text-[13.5px] text-ink-2">
                {a.does.map((d) => (
                  <li key={d} className="flex gap-2">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full" style={{ background: a.color }} />
                    {d}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-1">
                {a.tools.map((t) => (
                  <span key={t} className="rounded-md bg-paper-deep px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                    {t}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-4 border-t border-rule pt-3 text-[12px] text-ink-3">
                <span>
                  <b className="display text-[16px] text-ink">{st?.runs ?? "—"}</b> run{st?.runs === 1 ? "" : "s"}
                </span>
                {st?.avgMs != null && (
                  <span>
                    <b className="display text-[16px] text-ink">{(st.avgMs / 1000).toFixed(1)}s</b> avg
                  </span>
                )}
                {st?.lastAt && (
                  <span className="ml-auto">
                    last {prettyDay(istDay(st.lastAt), false)}, {istTime(st.lastAt)}
                  </span>
                )}
              </div>
              {name === "chowkidar" && (
                <Button className="mt-3 self-start" size="sm" variant="secondary" loading={patrolling} onClick={patrol}>
                  <Footprints size={15} /> Patrol now
                </Button>
              )}
            </article>
          );
        })}
      </div>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="display flex items-baseline gap-2 text-[22px] font-bold text-ink">
            Activity log
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilter(null)} className={clsx("rounded-full border px-3 py-1 text-[12.5px]", !filter ? "border-ink bg-ink text-sheet" : "border-rule-2 text-ink-2")}>
              All
            </button>
            {AGENT_ORDER.map((n) => (
              <button
                key={n}
                onClick={() => setFilter(n)}
                className={clsx("flex items-center gap-1.5 rounded-full border py-0.5 pr-3 pl-1 text-[12.5px]", filter === n ? "border-ink bg-ink text-sheet" : "border-rule-2 text-ink-2")}
              >
                <AgentGlyph agent={n} size={20} />
                {AGENTS[n].title}
              </button>
            ))}
          </div>
        </div>
        <div className="sheet h-[640px] overflow-hidden">
          <Diary embedded limit={120} agent={filter ?? undefined} />
        </div>
      </section>
    </div>
  );
}

/** How a request moves through the crew. */
function Box({ agent, note }: { agent: AgentName; note: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-rule bg-sheet px-3 py-2.5 shadow-[var(--shadow-sheet)]">
      <AgentGlyph agent={agent} size={30} />
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-ink">{AGENTS[agent].title}</p>
        <p className="truncate text-[11.5px] text-ink-3">{note}</p>
      </div>
    </div>
  );
}

function Flow() {
  return (
    <div className="ruled rounded-3xl border border-rule p-5 sm:p-6">
      <p className="eyebrow mb-4">How one sentence becomes a record</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-2xl border border-dashed border-rule-2 bg-sheet px-4 py-3">
          <p className="hand text-[18px] leading-snug">“Sharma owes me ₹2,000 by 31 Oct”</p>
          <p className="mt-1 text-[11.5px] text-ink-3">voice or text, any language</p>
        </div>
        <Arrow />
        <Box agent="sutradhar" note="works out what you want" />
        <Arrow />
        <span className="text-[13px] text-ink-3">hands it to one of</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Box agent="munshi" note="fills the slip · matches payments" />
        <Box agent="gawah" note="gets the other side's yes" />
        <Box agent="khoji" note="answers score questions" />
        <Box agent="dakiya" note="writes & sends reminders" />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-dashed border-rule-2 pt-4 text-[13px] text-ink-2">
        <span className="eyebrow">Every day, on its own</span>
        <Box agent="chowkidar" note="walks the ledger, takes points off" />
        <span className="text-ink-4">→</span>
        <Box agent="dakiya" note="chases what's due or late" />
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 40 12" className="hidden h-3 w-10 sm:block" aria-hidden>
      <line x1="0" y1="6" x2="34" y2="6" stroke="var(--stamp)" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M 32 1 L 39 6 L 32 11" fill="none" stroke="var(--stamp)" strokeWidth="1.5" />
    </svg>
  );
}
