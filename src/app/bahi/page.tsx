"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { PenLine } from "lucide-react";
import type { SlipView } from "@/lib/shared/types";
import { istDay, prettyDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { useAppState, useSlips } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { SlipRow } from "@/components/slip/SlipRow";
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

export default function LedgerPage() {
  const { actorId, openSlip, openComposer } = useApp();
  const { data: slips } = useSlips(actorId);
  const { data: state } = useAppState(actorId);
  const [tab, setTab] = useState<Tab>("open");
  const [side, setSide] = useState<"all" | "lena" | "dena">("all");

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
        Every slip you&apos;re part of. <b>Lena</b> is money owed to you, <b>dena</b> is money you owe.
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full bg-paper-deep p-1" role="tablist">
          {TABS.map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={clsx("rounded-full px-3.5 py-1.5 text-[13.5px] font-medium", tab === k ? "bg-sheet text-ink shadow-[var(--shadow-sheet)]" : "text-ink-3 hover:text-ink")}
            >
              {l} <span className="text-ink-4 tabular">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex rounded-full border border-rule p-1 text-[13px]">
          {(
            [
              ["all", "Both"],
              ["lena", "Lena · to receive"],
              ["dena", "Dena · to pay"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setSide(k)} className={clsx("rounded-full px-3 py-1", side === k ? "bg-carbon-soft font-semibold text-carbon" : "text-ink-3 hover:text-ink")}>
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
                      className="grid w-full grid-cols-[84px_minmax(0,1fr)_100px_100px_84px_150px_36px] items-center border-b border-[color-mix(in_oklab,var(--carbon)_12%,transparent)] px-2 py-2.5 text-left hover:bg-carbon-soft/30"
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
                      <span className="hand text-right text-[19px] text-stamp">{!mine ? rupees(s.amount) : ""}</span>
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
              <span className="hand text-right text-[20px] font-bold text-stamp">{rupees(dena)}</span>
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
