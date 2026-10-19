"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AppState } from "@/lib/shared/types";
import { weekdayDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { useAppState, useSlips } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { BoloBar } from "@/components/bolo/BoloBar";
import { Thread } from "@/components/bolo/Thread";
import { HowItWorks } from "@/components/home/HowItWorks";
import { MoneyTimeline } from "@/components/home/MoneyTimeline";
import { Taraazu } from "@/components/home/Taraazu";
import { WaitingCards, waitingItems } from "@/components/home/WaitingCards";
import { ScoreRing } from "@/components/score/ScoreRing";
import { BandPill, SectionTitle } from "@/components/ui/primitives";

function examplesFor(s: AppState | undefined): string[] {
  const me = s?.me.business.id;
  const other = me === "sharma-traders" ? "Gupta Kirana Store" : "Sharma Traders";
  const check = me === "sharma-traders" ? "Sunrise Steel" : "Sharma Traders";
  const ex = [`${other} owes me ₹2,000 by 31 October`, `Check the score for ${check} — how many payments are pending, and for how long?`];
  const c = s?.toConfirm[0];
  if (c) ex.push(`Haan, ${c.raisedBy === "creditor" ? c.creditor.name : c.debtor.name} ka ₹${c.amount.toLocaleString("en-IN")} sahi hai`);
  const o = s?.overdueToMe[0];
  if (o) ex.push(`Remind ${o.debtor.name} about the overdue payment`);
  ex.push("Who has the lowest score in the market?", "I owe Ganga Packaging 12k, 15 din mein");
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
          <BoloBar examples={examples} />

          {s && (
            <div className="grid gap-4 md:grid-cols-2 xl:hidden">
              <ScoreCard s={s} />
              <ScaleCard s={s} />
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
                hindi="आपकी हाँ चाहिए"
                action={waiting > 0 ? <Link href="/inbox" className="flex items-center gap-1 text-[13px] font-semibold text-mor hover:underline">Inbox <ArrowRight size={14} /></Link> : null}
              >
                Waiting for your word
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
                Your money, by due date
              </SectionTitle>
              {slips ? (
                slips.some((x) => x.status === "confirmed") ? (
                  <MoneyTimeline slips={slips} actorId={actorId} />
                ) : (
                  <p className="py-8 text-center text-[14px] text-ink-3">No open slips. Say one above and it shows up here.</p>
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
                <ScoreCard s={s} />
                <ScaleCard s={s} />
              </>
            ) : (
              <>
                <div className="h-64 skeleton" />
                <div className="h-80 skeleton" />
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
        <div className="h-4 w-48 skeleton" />
        <div className="h-12 w-80 skeleton" />
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
      <p className="text-[13px] font-medium text-ink-3">
        {weekdayDay(s.clock.today)} · {s.me.business.name}, {s.me.business.city}
      </p>
      <h1 className="display-wide mt-1 text-[34px] leading-[1.05] text-ink sm:text-[46px]">Namaste, {first}.</h1>
      <p className="mt-2 max-w-[640px] text-[16px] leading-snug text-ink-2 sm:text-[17px]">
        {bits.length ? (
          bits.map((b, i) => (
            <span key={i}>
              {i > 0 && (i === bits.length - 1 ? " and " : ", ")}
              {b}
            </span>
          ))
        ) : (
          <>All clear today. Say a new slip, or ask about anyone in the market.</>
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
        <p className="eyebrow">Your Saakh score</p>
        <BandPill band={sc.band} withHindi />
      </div>
      <div className="mt-3 flex items-center gap-4">
        <ScoreRing score={sc.score} band={sc.band} penalties={sc.penalties} size={128} />
        <div className="min-w-0 text-[13.5px] leading-snug text-ink-2">
          {sc.pointsLost === 0 ? (
            <p>
              <b className="text-ink">A perfect record.</b> Every debt you owed was paid on time.
            </p>
          ) : (
            <p>
              <b className="text-ink">
                {sc.pointsLost} point{sc.pointsLost === 1 ? "" : "s"} lost
              </b>{" "}
              to late payments.{" "}
              {unpaid ? (
                <span className="text-stamp">
                  {unpaid === sc.pointsLost ? "All" : unpaid} still unpaid, and the next one drops at the start of the month.
                </span>
              ) : (
                "All since paid — the record stays."
              )}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-rule pt-3 text-[12.5px]">
        <span className="text-ink-3">
          1 late month = <b className="text-stamp">−1 point</b>
        </span>
        <span className="flex items-center gap-1 font-semibold text-mor group-hover:underline">
          Your record <ArrowRight size={13} />
        </span>
      </div>
    </Link>
  );
}

function ScaleCard({ s }: { s: AppState }) {
  return (
    <section className="sheet p-5" aria-label="Your balance">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Your taraazu</p>
        <span className="font-deva text-[12px] text-ink-4">तराज़ू</span>
      </div>
      <div className="mt-2">
        <Taraazu stats={s.me.stats} />
      </div>
    </section>
  );
}
