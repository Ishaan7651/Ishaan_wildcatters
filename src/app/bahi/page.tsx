"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { PenLine } from "lucide-react";
import type { SlipView } from "@/lib/shared/types";
import { istDay, prettyDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { useAppState, useSlips } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { SlipRow } from "@/components/slip/SlipRow";
import { MoneyTimeline } from "@/components/home/MoneyTimeline";
import { Avatar, Button, Empty, PhasePill } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/PageHeader";

const TABS = [
  ["open", "Open"],
  ["awaiting", "Awaiting"],
  ["closed", "Closed"],
  ["all", "All"],
] as const;
type Tab = (typeof TABS)[number][0];

function inTab(s: SlipView, tab: Tab) {
  if (tab === "open") return s.status === "confirmed";
  if (tab === "awaiting") return s.status === "awaiting" || s.status === "countered" || s.status === "disputed";
  if (tab === "closed") return s.status === "paid" || s.status === "withdrawn";
  return true;
}

const noSubscribe = () => () => {};
function sideFromUrl() {
  const q = new URLSearchParams(window.location.search).get("side");
  return q === "lena" || q === "dena" ? q : null;
}

export default function LedgerPage() {
  const { actorId, openSlip, openComposer } = useApp();
  const { data: slips } = useSlips(actorId);
  const { data: state } = useAppState(actorId);
  const [tab, setTab] = useState<Tab>("open");
  // The scale on the home page links here with ?side=lena or ?side=dena.
  const linked = useSyncExternalStore(noSubscribe, sideFromUrl, () => null);
  const [picked, setSide] = useState<"all" | "lena" | "dena" | null>(null);
  const side = picked ?? linked ?? "all";

  const rows = useMemo(
    () =>
      (slips ?? [])
        .filter((s) => inTab(s, tab))
        .filter((s) => side === "all" || (side === "lena" ? s.creditor.id === actorId : s.debtor.id === actorId))
        .sort((a, b) => (tab === "open" ? (a.dueDate < b.dueDate ? -1 : 1) : a.raisedAt > b.raisedAt ? -1 : 1)),
    [slips, tab, side, actorId],
  );
  const lena = rows.filter((s) => s.creditor.id === actorId).reduce((a, s) => a + s.amount, 0);
  const dena = rows.filter((s) => s.debtor.id === actorId).reduce((a, s) => a + s.amount, 0);
  const today = state?.clock.today ?? istDay();
  const counts = Object.fromEntries(TABS.map(([k]) => [k, (slips ?? []).filter((s) => inTab(s, k)).length]));

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        eyebrow={state?.me.business.name}
        title="Ledger"
        hindi="बही"
        action={
          <Button variant="primary" onClick={() => openComposer({})}>
            <PenLine size={16} /> Write a slip
          </Button>
        }
      >
        Every slip you&apos;re part of. <b className="text-neem">Lena</b> is money owed to you, <b className="text-ink">dena</b> is money you owe.
      </PageHeader>

      {slips && state && slips.some((x) => x.status === "confirmed") && (
        <section className="sheet mb-8 p-4 sm:p-6" aria-label="Open slips by due date">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="display text-[19px] font-bold text-ink">Open slips, by due date</h2>
            <p className="text-[12.5px] text-ink-3">Left of today is late. Each late month costs the borrower a point.</p>
          </div>
          <MoneyTimeline slips={slips} actorId={actorId} />
        </section>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="seg" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {l} <span className="text-ink-4 tabular">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex rounded-full border border-rule bg-sheet p-1 text-[13px]">
          {(
            [
              ["all", "Both"],
              ["lena", "Lena · to receive"],
              ["dena", "Dena · to pay"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setSide(k)} aria-pressed={side === k} className={clsx("rounded-full px-3 py-1", side === k ? (k === "lena" ? "bg-neem-soft font-semibold text-neem" : "bg-paper-deep font-semibold text-ink") : "text-ink-3 hover:text-ink")}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {!slips ? (
        <div className="h-96 skeleton" />
      ) : rows.length === 0 ? (
        <Empty title="Nothing in this column" body="Speak a new slip on the Bolo page, or write one by hand." action={<Button onClick={() => openComposer({})}>Write a slip</Button>} />
      ) : (
        <>
          {/* Register — wide screens */}
          <div className="sheet hidden overflow-hidden lg:block">
            <div className="grid grid-cols-[84px_minmax(0,1fr)_100px_100px_84px_150px_36px] border-b-2 border-double border-stamp/50 bg-sheet-2 px-2 py-2.5">
              {["Date", "Party & note", "Lena ₹", "Dena ₹", "Due", "Status", "Pts"].map((h, i) => (
                <span key={h} className={clsx("eyebrow !text-[10.5px]", i === 0 && "pl-2", (i === 2 || i === 3 || i === 6) && "text-right", (i === 1 || i === 4) && "pl-4")}>
                  {h}
                </span>
              ))}
            </div>
            <ol>
              {rows.map((s) => {
                const mine = s.creditor.id === actorId;
                const other = mine ? s.debtor : s.creditor;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => openSlip(s.id)}
                      className="grid w-full grid-cols-[84px_minmax(0,1fr)_100px_100px_84px_150px_36px] items-center border-b border-[color-mix(in_oklab,var(--mor)_12%,transparent)] px-2 py-2.5 text-left hover:bg-mor-soft/30"
                    >
                      <span className="border-r-[1.5px] border-stamp/40 pr-2 pl-2 font-mono text-[11.5px] text-ink-3">
                        {prettyDay(istDay(s.raisedAt), false)}
                        <span className="block text-[10px] text-ink-4">{s.code}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-3 pl-4">
                        <Avatar id={other.id} name={other.name} size={30} />
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold text-ink">{other.name}</span>
                          <span className="hand block truncate text-[15px] leading-tight">{s.note || "—"}</span>
                        </span>
                      </span>
                      <span className="hand text-right text-[19px] text-neem">{mine ? rupees(s.amount) : ""}</span>
                      <span className="hand text-right text-[19px] text-ink">{!mine ? rupees(s.amount) : ""}</span>
                      <span className="pl-4 text-[13px] text-ink-2">{prettyDay(s.dueDate, false)}</span>
                      <span>
                        <PhasePill slip={s} />
                      </span>
                      <span className={clsx("display text-right text-[15px] font-semibold tabular", s.pointsLost ? "text-stamp" : "text-ink-4")}>{s.pointsLost ? `−${s.pointsLost}` : "·"}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="grid grid-cols-[84px_minmax(0,1fr)_100px_100px_84px_150px_36px] border-t-2 border-double border-stamp/50 bg-sheet-2 px-2 py-3">
              <span />
              <span className="eyebrow pl-4">Total · {rows.length} slips</span>
              <span className="hand text-right text-[20px] font-bold text-neem">{rupees(lena)}</span>
              <span className="hand text-right text-[20px] font-bold text-ink">{rupees(dena)}</span>
              <span className="col-span-3 pl-4 text-[13px] text-ink-2">
                Net <b className={lena - dena >= 0 ? "text-neem" : "text-stamp"}>{lena - dena >= 0 ? "+" : "−"}{rupees(Math.abs(lena - dena))}</b>
              </span>
            </div>
          </div>

          {/* Cards — phones and tablets */}
          <div className="sheet p-1.5 lg:hidden">
            {rows.map((s) => (
              <SlipRow key={s.id} slip={s} today={today} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
