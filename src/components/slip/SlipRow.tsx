"use client";

import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import type { SlipView } from "@/lib/shared/types";
import { addDays, diffDays, istDay, prettyDay, spanLabel } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { addMonths } from "@/lib/shared/dates";
import { Avatar, PhasePill } from "@/components/ui/primitives";
import { useApp } from "@/components/providers/Providers";

/**
 * Raised → due → today on one line. Once overdue, the red stretch carries a
 * notch at every month boundary — each notch is a point lost.
 */
export function AgingBar({ slip, today, className }: { slip: SlipView; today: string; className?: string }) {
  const raised = istDay(slip.raisedAt);
  const open = slip.status === "confirmed" || slip.status === "awaiting";
  const end = slip.payment?.acknowledged ? slip.payment.paidOn : open ? today : slip.dueDate;
  const last = end > slip.dueDate ? end : slip.dueDate;
  const span = Math.max(1, diffDays(last, raised));
  const x = (d: string) => `${Math.min(100, Math.max(0, (diffDays(d, raised) / span) * 100))}%`;
  const overdue = end > slip.dueDate;
  const notches: string[] = [];
  if (overdue) for (let m = 0; m < 24; m++) {
    const drop = addDays(addMonths(slip.dueDate, m), 1);
    if (drop > end) break;
    notches.push(drop);
  }
  return (
    <div className={clsx("relative h-5", className)} aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-rule" />
      <div
        className={clsx("absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full", slip.phase === "due_soon" || slip.phase === "due_today" ? "bg-haldi" : "bg-mor/70")}
        style={{ left: 0, width: x(end < slip.dueDate ? end : slip.dueDate) }}
      />
      {overdue && (
        <div className="absolute top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-stamp" style={{ left: x(slip.dueDate), width: `calc(${x(end)} - ${x(slip.dueDate)})` }} />
      )}
      <div className="absolute top-0.5 h-4 w-px bg-ink-3" style={{ left: x(slip.dueDate) }} />
      {notches.map((d) => (
        <div key={d} className="absolute top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-sheet bg-stamp" style={{ left: x(d) }} />
      ))}
      {open && <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sheet bg-ink" style={{ left: x(end) }} />}
    </div>
  );
}

export function SlipRow({
  slip,
  viewer,
  today,
  actions,
  className,
}: {
  slip: SlipView;
  /** Whose side we're looking from. Defaults to the business you're acting as. */
  viewer?: string;
  today: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  const { openSlip, actorId } = useApp();
  const v = viewer ?? actorId;
  const viewerIsLender = slip.creditor.id === v;
  const viewerIsBorrower = slip.debtor.id === v;
  const showBoth = !viewerIsLender && !viewerIsBorrower;
  const other = viewerIsLender ? slip.debtor : slip.creditor;
  const headline = showBoth ? `${slip.debtor.name} → ${slip.creditor.name}` : other.name;
  const mine = v === actorId;
  const sub = viewerIsLender ? (mine ? "owes you" : "borrower") : viewerIsBorrower ? (mine ? "you owe" : "lender") : "";
  const open = slip.status === "confirmed";
  return (
    <div
      className={clsx(
        "group relative grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-2xl border border-transparent px-3 py-3 transition-colors hover:border-rule hover:bg-sheet",
        className,
      )}
    >
      <button onClick={() => openSlip(slip.id)} className="absolute inset-0 rounded-2xl" aria-label={`Open slip ${slip.code}`} />
      <Avatar id={showBoth ? slip.debtor.id : other.id} name={showBoth ? slip.debtor.name : other.name} size={38} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[15px] font-semibold text-ink">{headline}</span>
          {sub && <span className="shrink-0 text-[12px] text-ink-3">{sub}</span>}
        </div>
        <div className="truncate text-[13px] text-ink-3">
          {slip.note || "No note"} · <span className="font-mono text-[11px]">{slip.code}</span>
        </div>
      </div>
      <div className="text-right">
        <div className={clsx("display text-[18px] font-semibold tabular", slip.phase === "overdue" ? "text-stamp" : "text-ink")}>{rupees(slip.amount)}</div>
      </div>
      <div className="col-span-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:col-start-2 sm:col-end-4">
        <div className="min-w-[150px] flex-1">
          {(open || slip.status === "paid") && <AgingBar slip={slip} today={today} />}
          <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
            <span>Due {prettyDay(slip.dueDate, false)}</span>
            {open && <span>· outstanding {spanLabel(slip.pendingDays)}</span>}
            {slip.pointsLost > 0 && <span className="font-semibold text-stamp">· −{slip.pointsLost} pt{slip.pointsLost > 1 ? "s" : ""}</span>}
          </div>
        </div>
        <div className="relative z-10 ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
          <PhasePill slip={slip} />
          <ChevronRight size={16} className="hidden text-ink-4 group-hover:text-ink-2 sm:block" />
        </div>
      </div>
    </div>
  );
}
