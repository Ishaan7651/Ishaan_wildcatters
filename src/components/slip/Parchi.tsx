"use client";

import clsx from "clsx";
import { Check, X } from "lucide-react";
import type { SlipView } from "@/lib/shared/types";
import { istDay, prettyDay } from "@/lib/shared/dates";
import { rupees, rupeesInWords, rupeesShort } from "@/lib/shared/money";
import { Stamp, type StampKind } from "./Stamp";

export interface Signature {
  name: string;
  state: "signed" | "pending" | "refused";
  date?: string;
  you?: boolean;
}

/**
 * The parchi — a two-ply mor slip with a counterfoil. Every debt on Saakh
 * is drawn as one. Fields can be swapped for inputs when it's a draft.
 */
export function Parchi({
  code,
  raisedOn,
  borrower,
  lender,
  amount,
  amountSlot,
  dueDate,
  dueSlot,
  note,
  noteSlot,
  signatures,
  stamp,
  stampDate,
  stampAnimate = true,
  draft = false,
  children,
  className,
}: {
  code: string;
  raisedOn?: string;
  borrower: React.ReactNode;
  lender: React.ReactNode;
  amount: number | null;
  amountSlot?: React.ReactNode;
  dueDate: string | null;
  dueSlot?: React.ReactNode;
  note?: string;
  noteSlot?: React.ReactNode;
  signatures: [Signature, Signature];
  stamp?: StampKind | null;
  stampDate?: string;
  stampAnimate?: boolean;
  draft?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("relative", className)}>
      {/* the mor duplicate peeking out behind */}
      <div
        aria-hidden
        className="parchi-notch absolute inset-0 translate-x-[7px] translate-y-[7px] rotate-[0.7deg] rounded-[18px] border border-rule bg-duplicate"
      />
      <div className="relative" style={{ filter: "drop-shadow(0 1px 1px rgb(var(--shadow-rgb) / .06)) drop-shadow(0 10px 18px rgb(var(--shadow-rgb) / .12))" }}>
        <div className="parchi-notch flex rounded-[18px] border border-rule-2 bg-sheet">
          {/* counterfoil */}
          <div className="hidden w-[68px] shrink-0 flex-col items-center justify-between py-4 sm:flex">
            <span className="display text-[11px] font-semibold tracking-[0.22em] text-ink-3 [writing-mode:vertical-rl] rotate-180">SAAKH · पर्ची</span>
            <span className="hand text-[15px] leading-none" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
              {amount ? rupeesShort(amount) : "—"}
            </span>
            <span className="font-mono text-[10px] text-ink-4 [writing-mode:vertical-rl] rotate-180">{code}</span>
          </div>
          <div className="perforation hidden w-[3px] shrink-0 sm:block" />

          {/* body */}
          <div className="relative min-w-0 flex-1 px-5 pt-4 pb-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow">
                {draft ? "Draft parchi" : "Parchi"} <span className="font-deva tracking-normal normal-case">· पर्ची</span>
              </span>
              <span className="font-mono text-[11px] text-ink-3">
                {code}
                {raisedOn && <span className="text-ink-4"> · {prettyDay(istDay(raisedOn), false)}</span>}
              </span>
            </div>

            <div className="mt-3 space-y-0.5">
              <div className="hand dotted-under pb-0.5 text-[22px] leading-tight sm:text-[24px]">{borrower}</div>
              <div className="eyebrow py-0.5 !tracking-[0.2em]">owes</div>
              <div className="hand dotted-under pb-0.5 text-[22px] leading-tight sm:text-[24px]">{lender}</div>
            </div>

            <div className="mt-4">
              <div className="hand text-[40px] leading-none sm:text-[46px]">{amountSlot ?? (amount ? rupees(amount) : "₹ —")}</div>
              <p className="mt-1.5 text-[12px] italic text-ink-3 first-letter:uppercase">{amount ? rupeesInWords(amount) : "Amount not given yet"}</p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr] sm:gap-6">
              <div>
                <div className="eyebrow">Due by</div>
                <div className="hand mt-0.5 text-[19px] leading-tight">{dueSlot ?? (dueDate ? prettyDay(dueDate) : "—")}</div>
              </div>
              <div className="min-w-0">
                <div className="eyebrow">For</div>
                <div className="hand mt-0.5 truncate text-[19px] leading-tight">{noteSlot ?? (note || <span className="text-ink-4">—</span>)}</div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {signatures.map((s, i) => (
                <SignatureBox key={i} sig={s} role={i === 0 ? "Borrower" : "Lender"} />
              ))}
            </div>

            {stamp && (
              <div className="absolute right-3 bottom-14 sm:right-6 sm:bottom-12">
                <Stamp kind={stamp} date={stampDate} animate={stampAnimate} />
              </div>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function SignatureBox({ sig, role }: { sig: Signature; role: string }) {
  return (
    <div
      className={clsx(
        "min-w-0 rounded-xl border px-3 py-2",
        sig.state === "signed" && "border-rule bg-sheet-2",
        sig.state === "pending" && "border-dashed border-rule-2",
        sig.state === "refused" && "border-stamp/40 bg-stamp-soft",
      )}
    >
      <div className="eyebrow flex items-center justify-between !text-[10px]">
        <span>
          {role}
          {sig.you && <span className="ml-1 text-mor">· you</span>}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[13px] font-medium text-ink">{sig.name}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[12px]">
        {sig.state === "signed" && (
          <>
            <Check size={13} className="text-neem" strokeWidth={2.5} />
            <span className="hand text-[14px] leading-none">agreed{sig.date ? ` ${prettyDay(istDay(sig.date), false)}` : ""}</span>
          </>
        )}
        {sig.state === "pending" && (
          <span className="flex items-center gap-1.5 text-ink-3">
            <span className="size-1.5 rounded-full bg-mor writing-dot" /> waiting for their word
          </span>
        )}
        {sig.state === "refused" && (
          <>
            <X size={13} className="text-stamp" strokeWidth={2.5} />
            <span className="text-stamp">didn&apos;t agree</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Builds Parchi props from a live slip, from the point of view of `actorId`. */
export function parchiProps(slip: SlipView, actorId?: string) {
  const raiserIsLender = slip.raisedBy === "creditor";
  const confirmerState: Signature["state"] =
    slip.status === "awaiting" ? "pending" : slip.status === "disputed" || slip.status === "countered" ? "refused" : slip.status === "withdrawn" ? "pending" : "signed";
  const lender: Signature = {
    name: slip.creditor.name,
    state: raiserIsLender ? "signed" : confirmerState,
    date: raiserIsLender ? slip.raisedAt : slip.confirmedAt,
    you: slip.creditor.id === actorId,
  };
  const borrower: Signature = {
    name: slip.debtor.name,
    state: raiserIsLender ? confirmerState : "signed",
    date: raiserIsLender ? slip.confirmedAt : slip.raisedAt,
    you: slip.debtor.id === actorId,
  };
  const stamp: StampKind | null =
    slip.status === "paid" ? "paid" : slip.status === "confirmed" ? "confirmed" : slip.status === "disputed" ? "disputed" : slip.status === "countered" ? "countered" : slip.status === "withdrawn" ? "withdrawn" : null;
  const stampDate =
    slip.status === "paid" ? slip.payment?.paidOn : slip.status === "confirmed" && slip.confirmedAt ? istDay(slip.confirmedAt) : slip.dispute ? istDay(slip.dispute.at) : undefined;
  return {
    code: slip.code,
    raisedOn: slip.raisedAt,
    borrower: slip.debtor.name,
    lender: slip.creditor.name,
    amount: slip.amount,
    dueDate: slip.dueDate,
    note: slip.note,
    signatures: [borrower, lender] as [Signature, Signature],
    stamp,
    stampDate,
  };
}
