"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AppState } from "@/lib/shared/types";
import { rupees } from "@/lib/shared/money";
import { useAppState, useSlips } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { BoloBar } from "@/components/bolo/BoloBar";
import { Thread } from "@/components/bolo/Thread";
import { HowItWorks } from "@/components/home/HowItWorks";
import { MoneyTimeline } from "@/components/home/MoneyTimeline";
import { QuickSlip } from "@/components/home/QuickSlip";
import { Taraazu } from "@/components/home/Taraazu";
import { WaitingCards, waitingItems } from "@/components/home/WaitingCards";
import { ScoreRing } from "@/components/score/ScoreRing";
import { BandPill, SectionTitle } from "@/components/ui/primitives";

function examplesFor(s: AppState | undefined): string[] {
  const me = s?.me.business.id;
  const other = me === "sharma-traders" ? "Gupta Kirana Store" : "Sharma Traders";
  const check = me === "sharma-traders" ? "Sunrise Steel" : "Sharma Traders";
  const ex = [`${other} owes me ₹2,000 by 31 Oct`, `Score for ${check}?`];
  const c = s?.toConfirm[0];
  if (c) ex.push(`Yes, ${c.raisedBy === "creditor" ? c.creditor.name : c.debtor.name}'s ₹${c.amount.toLocaleString("en-IN")} is right`);
  const o = s?.overdueToMe[0];
  if (o) ex.push(`Remind ${o.debtor.name}`);
  ex.push("Who has the lowest score?", "I owe Ganga Packaging 12k in 15 days");
  return ex;
}

export default function BoloPage() {
  const { actorId, turns: allTurns } = useApp();
  const turns = allTurns.filter((t) => t.actorId === actorId);
  const { data: s } = useAppState(actorId);
  const { data: slips } = useSlips(actorId);
  const examples = examplesFor(s);
  const waiting = s ? waitingItems(s).length : 0;

  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_350px] xl:gap-10">
        <div className="min-w-0 space-y-8">
          <Greeting s={s} />
          <div className="space-y-3">
            <BoloBar examples={examples} chips={2} />
            <QuickSlip slips={slips} />
          </div>

          {s && (
            <div className="grid gap-4 md:grid-cols-2 xl:hidden">
              <ScaleCard s={s} />
              <ScoreCard s={s} />
            </div>
          )}

          {turns.length > 0 ? (
            <section aria-label="Conversation">
              <Thread today={s?.clock.today ?? ""} />
            </section>
          ) : (
            <HowItWorks />
          )}

          {s && (
            <section aria-label="Waiting for your word">
              <SectionTitle
                count={waiting}
                action={waiting > 0 ? <Link href="/inbox" className="flex items-center gap-1 text-[13px] font-semibold text-mor hover:underline">Inbox <ArrowRight size={14} /></Link> : null}
              >
                Needs your yes
              </SectionTitle>
              <WaitingCards state={s} />
            </section>
          )}

          {s && (
            <section aria-label="Your money by due date" className="sheet p-4 sm:p-6">
              <SectionTitle
                hindi="हिसाब"
                action={<Link href="/bahi" className="flex items-center gap-1 text-[13px] font-semibold text-mor hover:underline">Ledger <ArrowRight size={14} /></Link>}
              >
                Due dates
              </SectionTitle>
              {slips ? (
                slips.some((x) => x.status === "confirmed") ? (
                  <MoneyTimeline slips={slips} actorId={actorId} />
                ) : (
                  <p className="py-8 text-center text-[14px] text-ink-3">No open slips yet.</p>
                )
              ) : (
                <div className="h-64 skeleton" />
              )}
            </section>
          )}
        </div>

        <aside className="hidden xl:block" aria-label="Your shop at a glance">
          <div className="sticky top-[88px] space-y-5">
            {s ? (
              <>
                <ScaleCard s={s} />
                <ScoreCard s={s} />
              </>
            ) : (
              <>
                <div className="h-80 skeleton" />
                <div className="h-64 skeleton" />
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Greeting({ s }: { s: AppState | undefined }) {
  if (!s)
    return (
      <div className="space-y-3 sm:pt-2">
        <div className="h-12 w-80 skeleton" />
        <div className="h-4 w-64 skeleton" />
      </div>
    );
  const first = s.me.business.owner.split(" ")[0];
  const waiting = waitingItems(s).length;
  const lateToMe = s.overdueToMe.reduce((a, x) => a + x.amount, 0);
  const iOweSoon = s.dueSoon.length;
  const bits: React.ReactNode[] = [];
  if (waiting) bits.push(<><b className="marker text-ink">{waiting} slip{waiting === 1 ? "" : "s"}</b> need{waiting === 1 ? "s" : ""} your yes</>);
  if (lateToMe) bits.push(<><b className="text-stamp">{rupees(lateToMe)}</b> is late coming to you</>);
  if (iOweSoon) bits.push(<>{bits.length ? "you" : "You"} have <b className="text-ink">{iOweSoon} payment{iOweSoon === 1 ? "" : "s"}</b> due this week</>);

  return (
    <header className="sm:pt-2">
      <h1 className="display-wide text-[34px] leading-[1.05] text-ink sm:text-[46px]">Namaste, {first}.</h1>
      <p className="mt-2 max-w-[640px] text-[16px] leading-snug text-ink-2 sm:text-[17px]">
        {bits.length ? (
          bits.map((b, i) => (
            <span key={i}>
              {i > 0 && (i === bits.length - 1 ? " and " : ", ")}
              {b}
            </span>
          ))
        ) : (
          <>All clear today.</>
        )}
        {bits.length > 0 && "."}
      </p>
    </header>
  );
}

function ScoreCard({ s }: { s: AppState }) {
  const sc = s.me.score;
  const unpaid = sc.penalties.filter((p) => !p.settled).length;
  return (
    <Link href={`/b/${s.me.business.id}`} className="sheet group block p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">Score</p>
        <BandPill band={sc.band} />
      </div>
      <div className="mt-3 flex items-center gap-4">
        <ScoreRing score={sc.score} band={sc.band} penalties={sc.penalties} size={128} />
        <div className="min-w-0 leading-tight">
          {sc.pointsLost === 0 ? (
            <p className="display text-[18px] font-bold text-neem">Perfect record</p>
          ) : (
            <>
              <p className="display text-[26px] font-bold text-stamp tabular">−{sc.pointsLost}</p>
              <p className="text-[13px] text-ink-2">{unpaid ? <span className="font-medium text-stamp">{unpaid} still unpaid</span> : "all since paid"}</p>
            </>
          )}
          <span className="mt-2 flex items-center gap-1 text-[12.5px] font-semibold text-mor group-hover:underline">
            Record <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function ScaleCard({ s }: { s: AppState }) {
  return (
    <section className="sheet p-5" aria-label="Your balance">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Taraazu</p>
        <span className="font-deva text-[12px] text-ink-4">तराज़ू</span>
      </div>
      <div className="mt-2">
        <Taraazu stats={s.me.stats} />
      </div>
    </section>
  );
}
