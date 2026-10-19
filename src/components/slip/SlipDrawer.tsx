"use client";

import { useState } from "react";
import clsx from "clsx";
import { motion } from "motion/react";
import { ArrowLeftRight, Check, CircleSlash, HandCoins, Mail, MessageCircleWarning, Send, Undo2 } from "lucide-react";
import type { SlipView } from "@/lib/shared/types";
import { istDay, istTime, prettyDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { postJSON, useAppState, useSlip } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { Sheet } from "@/components/ui/overlay";
import { AgentGlyph, Button, PhasePill } from "@/components/ui/primitives";
import { Parchi, parchiProps } from "./Parchi";
import { Postcard } from "./Postcard";

export function SlipDrawer() {
  const { slipId, openSlip } = useApp();
  const { data: slip } = useSlip(slipId);
  return (
    <Sheet
      open={!!slipId}
      onClose={() => openSlip(null)}
      width={560}
      title={
        slip ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[12px] text-ink-3">{slip.code}</span>
            <PhasePill slip={slip} />
          </div>
        ) : (
          <span className="eyebrow">Slip</span>
        )
      }
    >
      {slip ? <SlipDetailKeyed slip={slip} /> : <div className="m-6 h-80 skeleton" />}
    </Sheet>
  );
}

export function useSlipAction() {
  const { actorId, toast, refreshAll } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (slip: SlipView, action: string, extra: Record<string, unknown> = {}, success?: string) => {
    setBusy(action);
    try {
      await postJSON(`/api/slips/${slip.id}/action`, { actorId, action, ...extra });
      if (success) toast({ title: success, tone: "good", agent: action === "confirm" || action === "accept_counter" ? "gawah" : undefined });
      await refreshAll();
      return true;
    } catch (e) {
      toast({ title: "Couldn't do that", body: (e as Error).message, tone: "bad" });
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { run, busy };
}

/** Remounts the detail when the slip, the viewer or the day changes, so its local state starts fresh. */
function SlipDetailKeyed({ slip }: { slip: SlipView }) {
  const { actorId } = useApp();
  const { data: state } = useAppState(actorId);
  const today = state?.clock.today ?? istDay();
  return <SlipDetail key={`${slip.id}:${actorId}:${today}`} slip={slip} today={today} />;
}

function SlipDetail({ slip, today }: { slip: SlipView; today: string }) {
  const { actorId, setActor, toast, refreshAll } = useApp();
  const { run, busy } = useSlipAction();
  const [mode, setMode] = useState<null | "dispute" | "pay" | "remind">(null);
  const [reason, setReason] = useState("");
  const [counter, setCounter] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [reminder, setReminder] = useState<{ message: string; tone: string } | null>(null);
  const [remLoading, setRemLoading] = useState(false);


  const iAmLender = slip.creditor.id === actorId;
  const iAmBorrower = slip.debtor.id === actorId;
  const raiserId = slip.raisedBy === "creditor" ? slip.creditor.id : slip.debtor.id;
  const iRaised = raiserId === actorId;
  const iConfirm = slip.status === "awaiting" && (iAmLender || iAmBorrower) && !iRaised;
  const confirmerParty = slip.raisedBy === "creditor" ? slip.debtor : slip.creditor;
  const paymentPending = slip.status === "confirmed" && slip.payment && !slip.payment.acknowledged;
  const raiserParty = slip.raisedBy === "creditor" ? slip.creditor : slip.debtor;
  const handOff =
    slip.status === "awaiting" && iRaised
      ? confirmerParty
      : paymentPending && iAmBorrower
        ? slip.creditor
        : (slip.status === "countered" || slip.status === "disputed") && (iAmLender || iAmBorrower) && !iRaised
          ? raiserParty
          : null;

  const draftReminder = async () => {
    setMode("remind");
    setRemLoading(true);
    try {
      setReminder(await postJSON(`/api/slips/${slip.id}/remind`, { actorId, dryRun: true }));
    } catch (e) {
      toast({ title: "Dakiya couldn't write that", body: (e as Error).message, tone: "bad" });
      setMode(null);
    } finally {
      setRemLoading(false);
    }
  };
  const sendReminder = async () => {
    if (!reminder) return;
    setRemLoading(true);
    try {
      await postJSON(`/api/slips/${slip.id}/remind`, { actorId, ...reminder });
      toast({ title: `Reminder sent to ${slip.debtor.name}`, body: "It's in their Saakh inbox now.", agent: "dakiya" });
      setMode(null);
      await refreshAll();
    } catch (e) {
      toast({ title: "Couldn't send", body: (e as Error).message, tone: "bad" });
    } finally {
      setRemLoading(false);
    }
  };

  return (
    <div className="space-y-6 px-5 pt-5 pb-10">
      <Parchi {...parchiProps(slip, actorId)} />

      {/* What this means for the score */}
      <ScoreImpact slip={slip} />

      {/* Actions for whoever is looking */}
      <div className="space-y-3">
        {iConfirm && mode !== "dispute" && (
          <div className="rounded-2xl border border-mor/25 bg-mor-soft/60 p-4">
            <p className="text-[14px] text-ink">
              <b>{slip.raisedBy === "creditor" ? slip.creditor.name : slip.debtor.name}</b> wrote this slip. Nothing counts until you agree.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" loading={busy === "confirm"} onClick={() => run(slip, "confirm", {}, "Stamped — it's on record for both of you")}>
                <Check size={16} /> Haan, sahi hai
              </Button>
              <Button variant="danger" onClick={() => setMode("dispute")}>
                <MessageCircleWarning size={16} /> Nahi — something&apos;s wrong
              </Button>
            </div>
          </div>
        )}

        {iConfirm && mode === "dispute" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-stamp/30 bg-sheet p-4">
            <label className="eyebrow" htmlFor="reason">What&apos;s wrong with it?</label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. 2 kg came back damaged"
              className="mt-1.5 w-full resize-none rounded-xl border border-rule-2 bg-sheet-2 px-3 py-2 text-[14px] outline-none focus:border-mor"
            />
            <label className="eyebrow mt-3 block" htmlFor="counter">The right amount (optional)</label>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="hand text-[20px]">₹</span>
              <input
                id="counter"
                inputMode="numeric"
                value={counter}
                onChange={(e) => setCounter(e.target.value.replace(/[^\d]/g, ""))}
                placeholder={String(slip.amount)}
                className="hand w-40 rounded-xl border border-rule-2 bg-sheet-2 px-3 py-1.5 text-[20px] outline-none focus:border-mor"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="danger"
                loading={busy === "dispute"}
                onClick={async () => {
                  const ok = await run(slip, "dispute", { reason, amount: counter ? Number(counter) : undefined }, counter ? `Sent your revised amount of ${rupees(Number(counter))}` : "Marked as disputed");
                  if (ok) setMode(null);
                }}
              >
                {counter ? `Propose ${rupees(Number(counter))}` : "Send dispute"}
              </Button>
              <Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
            </div>
          </motion.div>
        )}

        {slip.status === "awaiting" && iRaised && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rule bg-sheet p-4">
            <p className="mr-auto text-[14px] text-ink-2">Waiting for <b className="text-ink">{confirmerParty.name}</b> to confirm.</p>
            <Button variant="ghost" size="sm" loading={busy === "withdraw"} onClick={() => run(slip, "withdraw", {}, "Slip withdrawn")}>
              <Undo2 size={15} /> Withdraw
            </Button>
          </div>
        )}

        {slip.status === "countered" && iRaised && (
          <div className="rounded-2xl border border-haldi/50 bg-haldi-soft/70 p-4">
            <p className="text-[14px] text-ink">
              <b>{confirmerParty.name}</b> says it should be <b>{rupees(slip.dispute?.counterAmount ?? 0)}</b>, not {rupees(slip.amount)}.
            </p>
            {slip.dispute?.reason && <p className="hand mt-1 text-[17px]">“{slip.dispute.reason}”</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" loading={busy === "accept_counter"} onClick={() => run(slip, "accept_counter", {}, `Agreed at ${rupees(slip.dispute?.counterAmount ?? 0)} — stamped`)}>
                <Check size={16} /> Accept {rupees(slip.dispute?.counterAmount ?? 0)}
              </Button>
              <Button variant="ghost" loading={busy === "withdraw"} onClick={() => run(slip, "withdraw", {}, "Slip withdrawn")}>
                Withdraw slip
              </Button>
            </div>
          </div>
        )}

        {slip.status === "disputed" && iRaised && (
          <div className="rounded-2xl border border-stamp/30 bg-stamp-soft/60 p-4">
            <p className="text-[14px] text-ink"><b>{confirmerParty.name}</b> doesn&apos;t agree with this slip.</p>
            {slip.dispute?.reason && <p className="hand mt-1 text-[17px]">“{slip.dispute.reason}”</p>}
            <p className="mt-1 text-[13px] text-ink-3">It won&apos;t affect anyone&apos;s score. Talk to them, then withdraw it or write a new one.</p>
            <Button className="mt-3" variant="secondary" size="sm" loading={busy === "withdraw"} onClick={() => run(slip, "withdraw", {}, "Slip withdrawn")}>
              Withdraw slip
            </Button>
          </div>
        )}

        {paymentPending && iAmLender && (
          <div className="rounded-2xl border border-mor/25 bg-mor-soft/60 p-4">
            <p className="text-[14px] text-ink">
              <b>{slip.debtor.name}</b> says they paid {rupees(slip.amount)} on {prettyDay(slip.payment!.paidOn)}. Did it reach you?
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" loading={busy === "ack_payment"} onClick={() => run(slip, "ack_payment", {}, "Payment confirmed — slip closed")}>
                <Check size={16} /> Haan, mil gaya
              </Button>
              <Button variant="danger" loading={busy === "reject_payment"} onClick={() => run(slip, "reject_payment", {}, "Told them it hasn't arrived")}>
                <CircleSlash size={16} /> Nahi mila
              </Button>
            </div>
          </div>
        )}
        {paymentPending && iAmBorrower && (
          <p className="rounded-2xl border border-rule bg-sheet p-4 text-[14px] text-ink-2">
            You marked this paid on {prettyDay(slip.payment!.paidOn)}. Waiting for {slip.creditor.name} to confirm it arrived.
          </p>
        )}

        {slip.status === "confirmed" && !paymentPending && (iAmLender || iAmBorrower) && mode !== "remind" && (
          <div className="rounded-2xl border border-rule bg-sheet p-4">
            {mode === "pay" ? (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="eyebrow" htmlFor="paidOn">{iAmLender ? "Received on" : "Paid on"}</label>
                  <input
                    id="paidOn"
                    type="date"
                    value={paidOn}
                    max={today}
                    onChange={(e) => setPaidOn(e.target.value)}
                    className="hand mt-1 block rounded-xl border border-rule-2 bg-sheet-2 px-3 py-1.5 text-[18px] outline-none focus:border-mor"
                  />
                </div>
                <Button
                  variant="primary"
                  loading={busy === "record_payment"}
                  onClick={async () => {
                    const ok = await run(slip, "record_payment", { paidOn }, iAmLender ? "Marked received — slip closed" : `Sent to ${slip.creditor.name} to confirm`);
                    if (ok) setMode(null);
                  }}
                >
                  {iAmLender ? `Mark ${rupees(slip.amount)} received` : `I paid ${rupees(slip.amount)}`}
                </Button>
                <Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
                {iAmBorrower && <p className="w-full text-[12px] text-ink-3">{slip.creditor.name} will be asked to confirm the money arrived.</p>}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => setMode("pay")}>
                  <HandCoins size={16} /> {iAmLender ? "Mark received" : "I've paid this"}
                </Button>
                {iAmLender && (
                  <Button variant="secondary" onClick={draftReminder}>
                    <Mail size={16} /> Ask Dakiya to remind them
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {mode === "remind" && (
          <div className="space-y-3">
            {remLoading && !reminder ? (
              <div className="flex items-center gap-3 rounded-2xl border border-rule bg-sheet p-4 text-[14px] text-ink-2">
                <AgentGlyph agent="dakiya" /> Dakiya is writing the reminder<span className="writing-dot">…</span>
              </div>
            ) : reminder ? (
              <>
                <Postcard
                  to={slip.debtor.name}
                  from={slip.creditor.name}
                  tone={reminder.tone}
                  message={reminder.message}
                  editable
                  onChange={(message) => setReminder({ ...reminder, message })}
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" loading={remLoading} onClick={sendReminder}>
                    <Send size={15} /> Send to {slip.debtor.name}
                  </Button>
                  <a
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-rule-2 bg-sheet px-4 text-[14px] font-medium text-ink hover:border-ink-3"
                    href={`https://wa.me/?text=${encodeURIComponent(reminder.message)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in WhatsApp
                  </a>
                  <Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button>
                </div>
              </>
            ) : null}
          </div>
        )}

        {handOff && (
          <button
            onClick={() => setActor(handOff.id)}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-rule-2 px-4 py-3 text-left text-[13px] text-ink-2 hover:border-mor hover:text-ink"
          >
            <ArrowLeftRight size={16} className="shrink-0 text-mor" />
            <span>
              <b className="text-ink">Demo:</b> switch to <b className="text-ink">{handOff.name}</b> to answer this from their side.
            </span>
          </button>
        )}
      </div>

      {slip.reminders.length > 0 && (
        <div>
          <h3 className="eyebrow mb-2">Reminders sent · {slip.reminders.length}</h3>
          <div className="space-y-3">
            {[...slip.reminders].reverse().slice(0, 3).map((r) => (
              <Postcard key={r.at} to={slip.debtor.name} from={slip.creditor.name} tone={r.tone} message={r.message} date={istDay(r.at)} compact />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="eyebrow mb-2">History</h3>
        <ol className="relative ml-3 border-l border-rule-2">
          {[...slip.timeline].reverse().map((t, i) => (
            <li key={i} className="relative pb-4 pl-5">
              <span
                className={clsx(
                  "absolute top-1.5 -left-[5px] size-[9px] rounded-full border-2 border-paper",
                  t.kind === "penalty" ? "bg-stamp" : t.kind === "confirmed" || t.kind === "paid" ? "bg-neem" : t.kind === "reminder" ? "bg-haldi" : "bg-mor",
                )}
              />
              <p className="text-[14px] text-ink">{t.text}</p>
              <p className="text-[12px] text-ink-3">
                {prettyDay(istDay(t.at))} · {istTime(t.at)}
              </p>
            </li>
          ))}
        </ol>
        {slip.utterance && (
          <p className="mt-2 rounded-xl bg-paper-deep/60 px-3 py-2 text-[13px] text-ink-2">
            Recorded by voice: <span className="hand text-[16px]">“{slip.utterance}”</span>
          </p>
        )}
      </div>
    </div>
  );
}

function ScoreImpact({ slip }: { slip: SlipView }) {
  let text: React.ReactNode;
  let tone = "neutral";
  if (slip.status === "awaiting") text = <>This doesn&apos;t touch anyone&apos;s score until both sides agree.</>;
  else if (slip.status === "disputed" || slip.status === "countered" || slip.status === "withdrawn") text = <>Not on record — no effect on any score.</>;
  else if (slip.status === "paid")
    text = slip.pointsLost ? (
      <>Paid {slip.daysOverdue} days late. <b>{slip.debtor.name}</b> lost {slip.pointsLost} point{slip.pointsLost > 1 ? "s" : ""} for it — that stays on record.</>
    ) : (
      <>Paid on time. No points lost.</>
    );
  else if (slip.daysToDue >= 0)
    text = (
      <>If it&apos;s still unpaid on <b>{prettyDay(slip.nextPointOn!, false)}</b>, <b>{slip.debtor.name}</b> loses 1 point — and another each month after.</>
    );
  else {
    tone = "bad";
    text = (
      <>
        <b>{slip.debtor.name}</b> has lost <b>{slip.pointsLost}</b> point{slip.pointsLost > 1 ? "s" : ""} on this so far. The next goes on <b>{prettyDay(slip.nextPointOn!, false)}</b>.
      </>
    );
  }
  return (
    <div className={clsx("flex items-start gap-3 rounded-2xl px-4 py-3 text-[14px]", tone === "bad" ? "bg-stamp-soft text-ink" : "bg-paper-deep/70 text-ink-2")}>
      <AgentGlyph agent="chowkidar" size={26} />
      <p className="pt-0.5">{text}</p>
    </div>
  );
}
