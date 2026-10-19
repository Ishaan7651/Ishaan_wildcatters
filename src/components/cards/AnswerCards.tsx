"use client";

import Link from "next/link";
import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import type { AnswerCard, BizLite, MeSummary, Profile, SlipView } from "@/lib/shared/types";
import { prettyDay, spanLabel } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { BAND_META } from "@/lib/shared/score";
import { ScoreRing } from "@/components/score/ScoreRing";
import { SlipRow } from "@/components/slip/SlipRow";
import { Avatar, BAND_COLOR, BandPill, ScoreChip } from "@/components/ui/primitives";

export function AnswerCardView({ card, today }: { card: AnswerCard; today: string }) {
  switch (card.kind) {
    case "profile":
      return <ProfileCard profile={card.profile} />;
    case "obligations":
      return <ObligationsCard title={card.title} business={card.business} role={card.role} slips={card.slips} today={today} />;
    case "leaderboard":
      return <LeaderboardCard title={card.title} rows={card.rows} />;
    case "position":
      return <PositionCard me={card.me} owes={card.owes} owed={card.owed} today={today} />;
    case "choices":
      return null;
  }
}

export function ProfileCard({ profile }: { profile: Profile }) {
  const { business: b, score, stats } = profile;
  const pending = stats.owes;
  return (
    <div className="sheet overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <ScoreRing score={score.score} band={score.band} penalties={score.penalties} size={150} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="display text-[24px] leading-tight font-semibold text-ink">{b.name}</h3>
            <BandPill band={score.band} withHindi />
          </div>
          <p className="text-[13.5px] text-ink-3">
            {b.owner} · {b.category} · {b.market}, {b.city}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
            <Stat label="Pending" value={`${pending.count}`} sub={rupees(pending.amount)} />
            <Stat label="Overdue" value={`${pending.overdueCount}`} sub={pending.overdueCount ? `${rupees(pending.overdueAmount)} · oldest ${spanLabel(pending.oldestOverdueDays)}` : "none"} bad={pending.overdueCount > 0} />
            <Stat label="Paid on time" value={stats.onTimeRate === null ? "—" : `${Math.round(stats.onTimeRate * 100)}%`} sub={`${stats.closedCount} paid`} />
            <Stat label="Points lost" value={`${score.pointsLost}`} sub={stats.avgDaysLate ? `avg ${stats.avgDaysLate}d late` : "never late"} bad={score.pointsLost > 0} />
          </dl>
        </div>
      </div>
      <Link
        href={`/b/${b.id}`}
        className="flex items-center justify-between border-t border-rule bg-sheet-2 px-5 py-2.5 text-[13px] font-medium text-carbon hover:bg-carbon-soft/50"
      >
        Full record — why each point was lost
        <ArrowUpRight size={15} />
      </Link>
    </div>
  );
}

function Stat({ label, value, sub, bad }: { label: string; value: string; sub: string; bad?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow !text-[10px]">{label}</dt>
      <dd className={clsx("display text-[22px] leading-tight font-semibold tabular", bad ? "text-stamp" : "text-ink")}>{value}</dd>
      <dd className="truncate text-[12px] text-ink-3">{sub}</dd>
    </div>
  );
}

export function ObligationsCard({ title, business, role, slips, today }: { title: string; business: BizLite; role: "debtor" | "creditor"; slips: SlipView[]; today: string }) {
  const total = slips.reduce((a, s) => a + s.amount, 0);
  const overdue = slips.filter((s) => s.phase === "overdue");
  const oldest = [...slips].sort((a, b) => b.pendingDays - a.pendingDays)[0];
  return (
    <div className="sheet overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule px-5 py-4">
        <div>
          <p className="eyebrow">{title}</p>
          <p className="display mt-0.5 text-[22px] font-semibold text-ink">
            {slips.length} {slips.length === 1 ? "payment" : "payments"} · {rupees(total)}
          </p>
        </div>
        {oldest && (
          <p className="text-right text-[13px] text-ink-3">
            Oldest outstanding <b className="text-ink">{spanLabel(oldest.pendingDays)}</b>
            {overdue.length > 0 && (
              <>
                <br />
                <span className="text-stamp">{overdue.length} overdue · {rupees(overdue.reduce((a, s) => a + s.amount, 0))}</span>
              </>
            )}
          </p>
        )}
      </div>
      {slips.length ? (
        <div className="p-2">
          {slips.map((s) => (
            <SlipRow key={s.id} slip={s} viewer={role === "debtor" ? s.debtor.id : s.creditor.id} today={today} />
          ))}
        </div>
      ) : (
        <p className="px-5 py-6 text-[14px] text-ink-3">Nothing here — {business.name} is all clear.</p>
      )}
    </div>
  );
}

export function LeaderboardCard({ title, rows }: { title: string; rows: (BizLite & { overdueAmount: number; pending: number })[] }) {
  return (
    <div className="sheet overflow-hidden">
      <p className="eyebrow border-b border-rule px-5 py-3">{title}</p>
      <ol className="divide-y divide-rule">
        {rows.map((r, i) => (
          <li key={r.id}>
            <Link href={`/b/${r.id}`} className="grid grid-cols-[22px_auto_1fr_auto] items-center gap-3 px-5 py-3 hover:bg-sheet-2">
              <span className="display text-[15px] font-semibold text-ink-4 tabular">{i + 1}</span>
              <Avatar id={r.id} name={r.name} size={34} />
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-semibold text-ink">{r.name}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {r.category} · {r.city}
                  {r.overdueAmount > 0 && <span className="text-stamp"> · {rupees(r.overdueAmount)} overdue</span>}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-rule sm:block">
                  <span className="block h-full rounded-full" style={{ width: `${r.score}%`, background: BAND_COLOR[r.band] }} />
                </span>
                <ScoreChip score={r.score} band={r.band} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PositionCard({ me, owes, owed, today }: { me: MeSummary; owes: SlipView[]; owed: SlipView[]; today: string }) {
  return (
    <div className="sheet overflow-hidden">
      <div className="flex items-center gap-4 border-b border-rule p-5">
        <ScoreRing score={me.score.score} band={me.score.band} penalties={me.score.penalties} size={92} />
        <div>
          <p className="eyebrow">Your standing</p>
          <p className="display text-[22px] font-semibold text-ink">
            {BAND_META[me.score.band].label} · {me.score.score}/100
          </p>
          <p className="text-[13px] text-ink-3">
            You owe {rupees(me.stats.owes.amount)} · you&apos;re owed {rupees(me.stats.owed.amount)}
          </p>
        </div>
      </div>
      <div className="grid gap-0 md:grid-cols-2 md:divide-x md:divide-rule">
        {(
          [
            ["You owe", owes],
            ["Owed to you", owed],
          ] as const
        ).map(([label, list]) => (
          <div key={label} className="p-2">
            <p className="eyebrow px-3 pt-2">
              {label} · {list.length}
            </p>
            {list.slice(0, 4).map((s) => (
              <SlipRow key={s.id} slip={s} today={today} />
            ))}
            {!list.length && <p className="px-3 py-3 text-[13px] text-ink-3">Nothing open.</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function dueLine(s: SlipView) {
  return s.daysToDue < 0 ? `${-s.daysToDue} days overdue` : `due ${prettyDay(s.dueDate, false)}`;
}
