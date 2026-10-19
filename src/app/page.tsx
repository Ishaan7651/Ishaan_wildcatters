"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { PenLine } from "lucide-react";
import type { AppState } from "@/lib/shared/types";
import { weekdayDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { BAND_META } from "@/lib/shared/score";
import { useAppState } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { BoloBar } from "@/components/bolo/BoloBar";
import { Thread } from "@/components/bolo/Thread";
import { NeedsYou } from "@/components/home/NeedsYou";
import { ScoreRing } from "@/components/score/ScoreRing";
import { Button, Ticker } from "@/components/ui/primitives";

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
  const { actorId, ask, turns: allTurns, openComposer } = useApp();
  const turns = allTurns.filter((t) => t.actorId === actorId);
  const { data: s } = useAppState(actorId);
  const examples = examplesFor(s);
  const first = s?.me.business.owner.split(" ")[0];

  return (
    <div className="mx-auto max-w-[820px]">
      <header className="flex items-end justify-between gap-5 pb-6 sm:pt-4">
        <div className="min-w-0">
          <p className="eyebrow">{s ? `${weekdayDay(s.clock.today)} · ${s.me.business.name}` : " "}</p>
          <h1 className="display mt-2 text-[34px] leading-[1.02] font-semibold tracking-tight text-ink sm:text-[46px]">
            {first ? (
              <>
                Namaste, {first}.
                <span className="block text-ink-3">Who owes whom today?</span>
              </>
            ) : (
              <span className="block h-[92px] w-72 skeleton" />
            )}
          </h1>
        </div>
        {s && (
          <Link href={`/b/${s.me.business.id}`} className="group hidden shrink-0 items-center gap-3 rounded-2xl p-2 pr-3 hover:bg-sheet sm:flex">
            <ScoreRing score={s.me.score.score} band={s.me.score.band} penalties={s.me.score.penalties} size={84} />
            <span className="text-left">
              <span className="eyebrow block">Your Saakh</span>
              <span className="display block text-[17px] font-semibold text-ink">{BAND_META[s.me.score.band].label}</span>
              <span className="block text-[12px] text-ink-3 group-hover:text-carbon">See your record →</span>
            </span>
          </Link>
        )}
      </header>

      <BoloBar examples={examples} />

      {turns.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-7 flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">Try</span>
          {examples.slice(0, 4).map((e) => (
            <button
              key={e}
              onClick={() => ask(e)}
              className="hand max-w-full truncate rounded-full border border-rule-2 bg-sheet px-3.5 py-1 text-left text-[15px] text-carbon-ink transition-colors hover:border-carbon hover:bg-carbon-soft/50"
            >
              {e}
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => openComposer({})}>
            <PenLine size={14} /> Write one by hand
          </Button>
        </motion.div>
      )}

      {turns.length > 0 && (
        <section className="mt-9" aria-label="Conversation">
          <Thread today={s?.clock.today ?? ""} />
        </section>
      )}

      {s && (
        <>
          <section className="mt-12" aria-label="Your money">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Money label="Owed to you" hindi="लेना" amount={s.me.stats.owed.amount} sub={`${s.me.stats.owed.count} slip${s.me.stats.owed.count === 1 ? "" : "s"}${s.me.stats.owed.overdueCount ? ` · ${s.me.stats.owed.overdueCount} overdue` : ""}`} tone={s.me.stats.owed.overdueCount ? "bad" : "neutral"} />
              <Money label="You owe" hindi="देना" amount={s.me.stats.owes.amount} sub={`${s.me.stats.owes.count} slip${s.me.stats.owes.count === 1 ? "" : "s"}${s.me.stats.owes.overdueCount ? ` · ${s.me.stats.owes.overdueCount} overdue` : ""}`} tone={s.me.stats.owes.overdueCount ? "bad" : "neutral"} />
              <Money label="Net" hindi="बाकी" amount={s.me.stats.owed.amount - s.me.stats.owes.amount} sub="owed to you minus what you owe" tone="neutral" signed />
            </div>
          </section>
          <NeedsYou state={s} />
        </>
      )}
    </div>
  );
}

function Money({ label, hindi, amount, sub, tone, signed }: { label: string; hindi: string; amount: number; sub: string; tone: "bad" | "neutral"; signed?: boolean }) {
  return (
    <div className="sheet px-5 py-4">
      <p className="eyebrow flex items-center justify-between">
        {label} <span className="font-deva text-[12px] tracking-normal text-ink-4 normal-case">{hindi}</span>
      </p>
      <p className="display mt-1 text-[30px] leading-none font-semibold text-ink">
        {signed && amount > 0 ? "+" : signed && amount < 0 ? "−" : ""}
        <Ticker value={Math.abs(amount)} format={(n) => rupees(n)} />
      </p>
      <p className={tone === "bad" ? "mt-1.5 text-[12.5px] text-stamp" : "mt-1.5 text-[12.5px] text-ink-3"}>{sub}</p>
    </div>
  );
}
