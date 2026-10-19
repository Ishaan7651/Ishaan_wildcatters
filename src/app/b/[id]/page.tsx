"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import clsx from "clsx";
import { MessageCircleQuestion, PenLine } from "lucide-react";
import type { Penalty, Profile } from "@/lib/shared/types";
import { istDay, prettyDay, spanLabel } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { BAND_META } from "@/lib/shared/score";
import { useAppState, useProfile } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { ScoreRing } from "@/components/score/ScoreRing";
import { ScoreHistory } from "@/components/score/ScoreHistory";
import { SlipRow } from "@/components/slip/SlipRow";
import { AgentGlyph, Avatar, BandPill, Button, Empty, SectionTitle } from "@/components/ui/primitives";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, error } = useProfile(id);
  const { actorId } = useApp();
  const { data: state } = useAppState(actorId);
  if (error) return <Empty title="Not on Saakh" body="That business isn't in the ledger." />;
  if (!p) return <div className="mx-auto max-w-[1000px] space-y-4 pt-6"><div className="h-72 skeleton" /><div className="h-56 skeleton" /></div>;
  return <ProfileView p={p} today={state?.clock.today ?? istDay()} isMe={p.business.id === actorId} />;
}

function ProfileView({ p, today, isMe }: { p: Profile; today: string; isMe: boolean }) {
  const router = useRouter();
  const { ask, openComposer } = useApp();
  const [tab, setTab] = useState<"owes" | "owed" | "closed">("owes");
  const b = p.business;
  const lists = { owes: p.owes, owed: p.owed, closed: p.closed };

  const grouped = useMemo(() => {
    const m = new Map<string, Penalty[]>();
    for (const x of p.score.penalties) m.set(x.slipId, [...(m.get(x.slipId) ?? []), x]);
    return [...m.values()].sort((a, b) => b.length - a.length);
  }, [p]);

  return (
    <div className="mx-auto max-w-[1000px]">
      <section className="grid items-center gap-8 pt-2 pb-8 md:grid-cols-[auto_1fr] md:pt-6">
        <div className="mx-auto">
          <ScoreRing score={p.score.score} band={p.score.band} penalties={p.score.penalties} size={248} />
          <p className="mt-2 text-center text-[12px] text-ink-3">Each red mark is one late month — hover or tap it</p>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Avatar id={b.id} name={b.name} size={44} />
            <div className="min-w-0">
              <p className="eyebrow">{isMe ? "Your Saakh record" : "Saakh record"}</p>
              <h1 className="display truncate text-[34px] leading-tight font-semibold text-ink sm:text-[42px]">{b.name}</h1>
            </div>
          </div>
          <p className="mt-2 text-[15px] text-ink-2">
            {b.owner} · {b.category} · {b.market}, {b.city}
            {b.invitedBy && <span className="ml-2 rounded-full bg-haldi-soft px-2 py-px text-[12px] text-haldi-ink">Invited — not joined yet</span>}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <BandPill band={p.score.band} withHindi />
            <span className="text-[13px] text-ink-3">{BAND_META[p.score.band].blurb} On Saakh since {prettyDay(b.joinedOn)}.</span>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Fact label="Owes now" value={rupees(p.stats.owes.amount)} sub={`${p.stats.owes.count} pending`} />
            <Fact label="Overdue" value={rupees(p.stats.owes.overdueAmount)} sub={p.stats.owes.overdueCount ? `${p.stats.owes.overdueCount} slip${p.stats.owes.overdueCount > 1 ? "s" : ""} · oldest ${spanLabel(p.stats.owes.oldestOverdueDays)}` : "nothing late"} bad={p.stats.owes.overdueCount > 0} />
            <Fact label="Paid on time" value={p.stats.onTimeRate === null ? "—" : `${Math.round(p.stats.onTimeRate * 100)}%`} sub={`of ${p.stats.closedCount} paid`} />
            <Fact label="Owed to them" value={rupees(p.stats.owed.amount)} sub={`${p.stats.owed.count} open`} />
          </dl>

          {!isMe && (
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  router.push("/");
                  ask(`Check the score for ${b.name} — how many payments are pending, and for how long?`);
                }}
              >
                <MessageCircleQuestion size={16} /> Ask Khoji about them
              </Button>
              <Button variant="secondary" onClick={() => openComposer({ counterpartyId: b.id })}>
                <PenLine size={16} /> Write a slip with them
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="sheet p-5">
          <SectionTitle hindi="क्यों">{p.score.pointsLost ? `Why ${p.score.pointsLost} point${p.score.pointsLost > 1 ? "s are" : " is"} gone` : "All 100 marks intact"}</SectionTitle>
          {grouped.length === 0 ? (
            <p className="text-[14px] text-ink-2">Every confirmed debt was paid by its due date.</p>
          ) : (
            <ol className="space-y-2.5">
              {grouped.map((g) => {
                const first = g[0];
                const slip = [...p.owes, ...p.closed].find((s) => s.id === first.slipId);
                return (
                  <li key={first.slipId} className="flex items-start gap-3 rounded-xl border border-rule bg-sheet-2 px-3.5 py-3">
                    <div className="flex w-14 shrink-0 flex-wrap gap-1 pt-1">
                      {g.map((x) => (
                        <span key={x.month} title={`Month ${x.month} · ${prettyDay(x.droppedOn)}`} className={clsx("size-2.5 rounded-full border-[1.5px] border-stamp", !x.settled && "bg-stamp")} />
                      ))}
                    </div>
                    <div className="min-w-0 flex-1 text-[13.5px]">
                      <p className="text-ink">
                        <b>{rupees(first.amount)}</b> to {first.creditor}
                        {slip?.note && <span className="text-ink-3"> · {slip.note}</span>}
                      </p>
                      <p className="text-ink-3">
                        Due {prettyDay(first.dueDate)} · {g.length} month{g.length > 1 ? "s" : ""} late ·{" "}
                        {first.settled ? <span>paid since — points stay</span> : <span className="text-stamp">still unpaid</span>}
                      </p>
                    </div>
                    <span className="display shrink-0 text-[18px] font-semibold text-stamp">−{g.length}</span>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-paper-deep/60 px-3 py-2.5 text-[12.5px] text-ink-2">
            <AgentGlyph agent="chowkidar" size={22} />
            <span>Chowkidar takes 1 point the day after a confirmed debt falls due unpaid, then 1 more at the start of every further month. Filled dots are still unpaid; hollow ones were paid late.</span>
          </div>
        </section>

        <section className="sheet p-5">
          <SectionTitle hindi="इतिहास">Score over time</SectionTitle>
          <ScoreHistory points={p.history} />
          <p className="mt-3 text-[12.5px] text-ink-3">Started at 100 on {prettyDay(p.history[0].day)}. Each step down is one late month.</p>
        </section>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex rounded-full bg-paper-deep p-1 sm:inline-flex" role="tablist">
          {(
            [
              ["owes", `${isMe ? "You owe" : "They owe"}`, p.owes.length],
              ["owed", `${isMe ? "Owed to you" : "Owed to them"}`, p.owed.length],
              ["closed", "History", p.closed.length],
            ] as const
          ).map(([k, l, n]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={clsx("flex-1 rounded-full px-4 py-1.5 text-[13.5px] font-medium", tab === k ? "bg-sheet text-ink shadow-[var(--shadow-sheet)]" : "text-ink-3")}
            >
              {l} <span className="text-ink-4">{n}</span>
            </button>
          ))}
        </div>
        {lists[tab].length ? (
          <div className="sheet p-1.5">
            {lists[tab].map((s) => (
              <SlipRow key={s.id} slip={s} viewer={b.id} today={today} />
            ))}
          </div>
        ) : (
          <Empty title="Nothing here" />
        )}
      </section>
    </div>
  );
}

function Fact({ label, value, sub, bad }: { label: string; value: string; sub: string; bad?: boolean }) {
  return (
    <div>
      <dt className="eyebrow !text-[10.5px]">{label}</dt>
      <dd className={clsx("display text-[24px] leading-tight font-semibold tabular", bad ? "text-stamp" : "text-ink")}>{value}</dd>
      <dd className="text-[12px] text-ink-3">{sub}</dd>
    </div>
  );
}
