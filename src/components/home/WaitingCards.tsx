"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { Check, CheckCheck, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { AppState, SlipView } from "@/lib/shared/types";
import { istDay, prettyDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { postJSON } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { Stamp, type StampKind } from "@/components/slip/Stamp";
import { Avatar, Button } from "@/components/ui/primitives";

type Item = { kind: "confirm" | "ack" | "counter"; slip: SlipView };

export function waitingItems(s: AppState): Item[] {
  return [
    ...s.toConfirm.map((slip) => ({ kind: "confirm" as const, slip })),
    ...s.paymentsToAck.map((slip) => ({ kind: "ack" as const, slip })),
    ...s.countersToReview.map((slip) => ({ kind: "counter" as const, slip })),
  ];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Everything that needs a yes or no from you, as slips you can stamp. A "haan"
 * slams the stamp down, then the card leaves the pile.
 */
export function WaitingCards({ state, layout = "row" }: { state: AppState; layout?: "row" | "grid" }) {
  const { actorId, toast, refreshAll } = useApp();
  const [stamped, setStamped] = useState<Record<string, StampKind>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const items = waitingItems(state);

  const act = async (slip: SlipView, action: string, stamp: StampKind | null, done: string) => {
    setBusy(`${slip.id}:${action}`);
    try {
      await postJSON(`/api/slips/${slip.id}/action`, { actorId, action });
      if (stamp) {
        setStamped((m) => ({ ...m, [slip.id]: stamp }));
        await sleep(950);
      }
      toast({ title: done, tone: "good", agent: stamp ? "gawah" : undefined });
      await refreshAll();
    } catch (e) {
      toast({ title: "Couldn't do that", body: (e as Error).message, tone: "bad" });
    } finally {
      setBusy(null);
    }
  };

  if (!items.length)
    return (
      <div className="flex items-center gap-4 rounded-[20px] border border-dashed border-rule-2 px-5 py-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-neem-soft text-neem">
          <CheckCheck size={22} />
        </span>
        <p className="text-[15px] font-semibold text-ink">Nothing waiting on you</p>
      </div>
    );

  const cards = (
    <AnimatePresence initial={false} mode="popLayout">
        {items.map((it) => (
          <motion.div
            key={it.slip.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24, rotate: -4, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={clsx(layout === "row" && "w-[290px] shrink-0 snap-start")}
          >
            <WaitCard item={it} actorId={actorId} stamp={stamped[it.slip.id]} busy={busy} act={act} />
          </motion.div>
        ))}
    </AnimatePresence>
  );

  if (layout === "grid") return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{cards}</div>;
  return <ScrollRow count={items.length}>{cards}</ScrollRow>;
}

/** A sideways pile with arrows and a soft fade wherever there's more to see. */
function ScrollRow({ children, count }: { children: React.ReactNode; count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);
  const mask = `linear-gradient(to right, ${edge.left ? "transparent, #000 48px" : "#000"}, ${edge.right ? "#000 calc(100% - 64px), transparent" : "#000"})`;
  const nudge = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * 308, behavior: "smooth" });
  return (
    <div className="group/row relative">
      <div
        ref={ref}
        onScroll={measure}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pt-1 pb-3 [scrollbar-width:none]"
        style={{ WebkitMaskImage: mask, maskImage: mask }}
      >
        {children}
      </div>
      {edge.left && (
        <button onClick={() => nudge(-1)} className="absolute top-1/2 -left-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-rule bg-sheet text-ink shadow-[var(--shadow-lift)] hover:bg-sheet-2 md:grid" aria-label="Earlier cards">
          <ChevronLeft size={18} />
        </button>
      )}
      {edge.right && (
        <button onClick={() => nudge(1)} className="absolute top-1/2 -right-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-rule bg-sheet text-ink shadow-[var(--shadow-lift)] hover:bg-sheet-2 md:grid" aria-label="More cards">
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

function WaitCard({
  item,
  actorId,
  stamp,
  busy,
  act,
}: {
  item: Item;
  actorId: string;
  stamp?: StampKind;
  busy: string | null;
  act: (slip: SlipView, action: string, stamp: StampKind | null, done: string) => Promise<void>;
}) {
  const { openSlip } = useApp();
  const { slip, kind } = item;
  const iAmLender = slip.creditor.id === actorId;
  const other = iAmLender ? slip.debtor : slip.creditor;
  const disputed = kind === "counter" && slip.status === "disputed";
  const amount = kind === "counter" ? slip.dispute?.counterAmount ?? slip.amount : slip.amount;

  const ask =
    kind === "confirm"
      ? prettyDay(istDay(slip.raisedAt), false)
      : kind === "ack"
        ? `says paid · ${prettyDay(slip.payment?.paidOn ?? istDay(slip.raisedAt), false)}`
        : disputed
          ? "disputes this"
          : "counter-offer";
  const what =
    kind === "confirm" ? (iAmLender ? "They owe you" : "You owe them") : kind === "ack" ? "Got it?" : disputed ? "Disputed" : `Not ${rupees(slip.amount)}, but`;

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-[20px] border border-rule bg-sheet shadow-[var(--shadow-sheet)]">
      <div className="h-1.5" style={{ background: kind === "ack" ? "var(--neem)" : disputed ? "var(--stamp)" : kind === "counter" ? "var(--haldi)" : "var(--genda)" }} />
      <button onClick={() => openSlip(slip.id)} className="flex items-center gap-3 px-4 pt-3.5 text-left" aria-label={`Open slip ${slip.code}`}>
        <Avatar id={other.id} name={other.name} size={36} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[14.5px] font-semibold text-ink">{other.name}</span>
          <span className="block truncate text-[12px] text-ink-3">{ask}</span>
        </span>
        <ChevronRight size={16} className="text-ink-4" />
      </button>

      <div className="relative px-4 pt-3 pb-1">
        <p className="text-[12.5px] font-medium text-ink-2">{what}</p>
        <p className="hand text-[38px] leading-[1.05]">{rupees(amount)}</p>
        <p className="mt-1.5 truncate text-[12.5px] text-ink-2">
          {slip.note ? `${slip.note} · ` : ""}due <b className="font-semibold text-ink">{prettyDay(slip.dueDate, false)}</b>
        </p>
        {kind === "counter" && slip.dispute?.reason && <p className="hand mt-1 truncate text-[15px]">“{slip.dispute.reason}”</p>}
        <AnimatePresence>
          {stamp && (
            <motion.div className="absolute inset-0 grid place-items-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Stamp kind={stamp} scale={0.9} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-auto flex items-center gap-2 px-4 pt-3 pb-4">
        {kind === "confirm" && (
          <>
            <Button variant="primary" className="flex-1" disabled={!!stamp} loading={busy === `${slip.id}:confirm`} onClick={() => act(slip, "confirm", "confirmed", `Stamped — ${rupees(slip.amount)} is on record`)}>
              <Check size={16} strokeWidth={2.6} /> Haan, sahi hai
            </Button>
            <Button variant="secondary" disabled={!!stamp} onClick={() => openSlip(slip.id)} aria-label="No, something's wrong">
              <X size={16} /> Nahi
            </Button>
          </>
        )}
        {kind === "ack" && (
          <>
            <Button variant="primary" className="flex-1" disabled={!!stamp} loading={busy === `${slip.id}:ack_payment`} onClick={() => act(slip, "ack_payment", "paid", "Payment confirmed — slip closed")}>
              <Check size={16} strokeWidth={2.6} /> Haan, mil gaya
            </Button>
            <Button variant="secondary" disabled={!!stamp} loading={busy === `${slip.id}:reject_payment`} onClick={() => act(slip, "reject_payment", null, "Told them it hasn't arrived")}>
              Nahi
            </Button>
          </>
        )}
        {disputed && (
          <>
            <Button variant="primary" className="flex-1" onClick={() => openSlip(slip.id)}>
              Talk it through
            </Button>
            <Button variant="secondary" disabled={!!stamp} loading={busy === `${slip.id}:withdraw`} onClick={() => act(slip, "withdraw", "withdrawn", "Slip withdrawn")}>
              Withdraw
            </Button>
          </>
        )}
        {kind === "counter" && !disputed && (
          <>
            <Button variant="primary" className="flex-1" disabled={!!stamp} loading={busy === `${slip.id}:accept_counter`} onClick={() => act(slip, "accept_counter", "confirmed", `Agreed at ${rupees(amount)} — stamped`)}>
              <Check size={16} strokeWidth={2.6} /> Accept {rupees(amount)}
            </Button>
            <Button variant="secondary" onClick={() => openSlip(slip.id)}>
              Open
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
