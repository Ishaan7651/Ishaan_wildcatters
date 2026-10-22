"use client";

import { useState } from "react";
import clsx from "clsx";
import { ArrowLeftRight, ArrowUpRight, Check, Repeat, Send, Volume2 } from "lucide-react";
import type { BoloResult, PaymentDraft, SlipDraft, SlipView } from "@/lib/shared/types";
import { prettyDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { postJSON, useAppState, useSlip } from "@/lib/client/api";
import { speak } from "@/lib/client/speak";
import { useApp, type Turn } from "@/components/providers/Providers";
import { Parchi, parchiProps } from "@/components/slip/Parchi";
import { Postcard } from "@/components/slip/Postcard";
import { SlipRow } from "@/components/slip/SlipRow";
import { useRaiseSlip } from "@/components/slip/Composer";
import { useSlipAction } from "@/components/slip/SlipDrawer";
import { AnswerCardView } from "@/components/cards/AnswerCards";
import { AgentGlyph, Button } from "@/components/ui/primitives";

export function TurnResult({ turn, today }: { turn: Turn; today: string }) {
  const r = turn.result as BoloResult;
  switch (r.kind) {
    case "slip_draft":
      return <SlipDraftResult turn={turn} draft={r.draft} />;
    case "payment_draft":
      return <PaymentResult turn={turn} draft={r.draft} today={today} />;
    case "answer":
      return <AnswerResult speech={r.speech} cards={r.cards} followUps={r.followUps} today={today} />;
    case "response":
      return <ResponseResult turn={turn} result={r} today={today} />;
    case "reminder_draft":
      return <ReminderResult turn={turn} slip={r.slip} message={r.message} tone={r.tone} />;
    case "message":
      return <MessageResult text={r.text} suggestions={r.suggestions} />;
  }
}

// ---------------------------------------------------------------- slips

function SlipDraftResult({ turn, draft }: { turn: Turn; draft: SlipDraft }) {
  const { actorId, updateTurn } = useApp();
  const { data: state } = useAppState(actorId);
  const { raise, busy } = useRaiseSlip();
  const [direction, setDirection] = useState(draft.direction);
  const [party, setParty] = useState<{ id?: string; name: string; isNew: boolean }>(draft.counterparty);
  const [amount, setAmount] = useState(draft.amount ? String(draft.amount) : "");
  const [due, setDue] = useState(draft.dueDate ?? "");
  const [note, setNote] = useState(draft.note);
  const myName = state?.me.business.name ?? "You";

  if (turn.outcome?.kind === "sent" && turn.outcome.slip) return <SentSlip slipId={turn.outcome.slip.id} />;
  if (turn.outcome?.kind === "discarded") return <p className="text-[13px] text-ink-3">Discarded — nothing was recorded.</p>;

  const amt = Number(amount);
  const partyNode = (
    <span className="inline-flex items-baseline gap-2">
      {party.name || <span className="text-ink-4">Who?</span>}
      {party.isNew && <span className="rounded-full bg-haldi-soft px-2 py-px font-sans text-[11px] font-semibold text-haldi-ink not-italic">new · will be invited</span>}
    </span>
  );
  const ready = !!party.name && amt > 0 && !!due;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <AgentGlyph agent="munshi" size={22} />
        <span>The Scribe filled this in. Check it, change anything, then send.</span>
      </div>

      <Parchi
        draft
        code="DRAFT"
        borrower={direction === "they_owe_me" ? partyNode : myName}
        lender={direction === "they_owe_me" ? myName : partyNode}
        amount={amt || null}
        amountSlot={
          <span className="flex items-baseline">
            ₹
            <input
              inputMode="numeric"
              value={amount ? Number(amount).toLocaleString("en-IN") : ""}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 9))}
              placeholder="0"
              aria-label="Amount in rupees"
              className="hand ml-1 w-full min-w-0 bg-transparent outline-none placeholder:text-ink-4"
            />
          </span>
        }
        dueDate={due}
        dueSlot={
          <span className="flex flex-col">
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="hand bg-transparent outline-none" />
            <span className={clsx("font-sans text-[11.5px] not-italic", draft.dueAssumed ? "text-haldi-ink" : "text-ink-3")}>
              {draft.dueAssumed ? "⚑ " : ""}
              {draft.dueReason}
            </span>
          </span>
        }
        note={note}
        noteSlot={<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="what it's for" aria-label="What it's for" className="hand w-full bg-transparent outline-none placeholder:text-ink-4" />}
        signatures={[
          { name: direction === "they_owe_me" ? party.name || "—" : myName, state: direction === "they_owe_me" ? "pending" : "signed", you: direction === "i_owe_them" },
          { name: direction === "they_owe_me" ? myName : party.name || "—", state: direction === "they_owe_me" ? "signed" : "pending", you: direction === "they_owe_me" },
        ]}
      />

      {(draft.alternatives.length > 0 || draft.questions.length > 0) && (
        <div className="space-y-2 rounded-2xl border border-haldi/40 bg-haldi-soft/60 px-4 py-3 text-[13.5px]">
          {draft.questions.map((q) => (
            <p key={q} className="text-ink">⚑ {q}</p>
          ))}
          {draft.alternatives.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-ink-2">Not {party.name || "them"}?</span>
              {draft.alternatives.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setParty({ id: a.id, name: a.name, isNew: false })}
                  className="rounded-full border border-rule-2 bg-sheet px-2.5 py-0.5 text-[12.5px] hover:border-mor"
                >
                  {a.name} <span className="text-ink-3">· {a.city}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="spotlight-actions flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="lg"
          className="w-full min-w-0 sm:w-auto"
          disabled={!ready}
          loading={busy}
          onClick={async () => {
            const slip = await raise({
              direction,
              counterpartyId: party.id,
              newCounterparty: party.id ? undefined : { name: party.name },
              amount: amt,
              dueDate: due,
              note,
              source: turn.source,
              utterance: turn.utterance,
            });
            if (slip) updateTurn(turn.id, { outcome: { kind: "sent", slip } });
          }}
        >
          <Send size={16} className="shrink-0" />
          <span className="truncate">
            Send to {party.name || "them"}
            <span className="hidden sm:inline"> for confirmation</span>
          </span>
        </Button>
        <Button variant="ghost" onClick={() => setDirection((d) => (d === "they_owe_me" ? "i_owe_them" : "they_owe_me"))}>
          <Repeat size={15} /> Swap who owes
        </Button>
        <Button variant="ghost" onClick={() => updateTurn(turn.id, { outcome: { kind: "discarded" } })}>
          Discard
        </Button>
      </div>
    </div>
  );
}

function SentSlip({ slipId }: { slipId: string }) {
  const { actorId, setActor, openSlip } = useApp();
  const { data: slip } = useSlip(slipId);
  if (!slip) return <div className="h-72 skeleton" />;
  const confirmer = slip.raisedBy === "creditor" ? slip.debtor : slip.creditor;
  const waiting = slip.status === "awaiting";
  return (
    <div className="space-y-3">
      <Parchi {...parchiProps(slip, actorId)} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 text-[13.5px] text-ink-2">
          <AgentGlyph agent="gawah" size={22} />
          {waiting ? (
            <>The Witness has asked <b className="text-ink">{confirmer.name}</b> to confirm.</>
          ) : slip.status === "confirmed" ? (
            <>
              <b className="text-ink">{confirmer.name}</b> confirmed. It&apos;s on record.
            </>
          ) : (
            <>Status: {slip.phase.replace("_", " ")}</>
          )}
        </span>
        <span className="flex-1" />
        {waiting && actorId !== confirmer.id && (
          <Button variant="secondary" size="sm" onClick={() => setActor(confirmer.id)}>
            <ArrowLeftRight size={14} /> Play {confirmer.name}
          </Button>
        )}
        <Button variant="quiet" size="sm" onClick={() => openSlip(slip.id)}>
          Open slip <ArrowUpRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- payments

function PaymentResult({ turn, draft, today }: { turn: Turn; draft: PaymentDraft; today: string }) {
  const { actorId, updateTurn } = useApp();
  const [chosen, setChosen] = useState<SlipView | null>(draft.slip);
  const [paidOn, setPaidOn] = useState(draft.paidOn);
  const { run, busy } = useSlipAction();
  if (turn.outcome?.kind === "paid" && turn.outcome.slip) return <SentSlip slipId={turn.outcome.slip.id} />;
  const iAmLender = chosen?.creditor.id === actorId;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <AgentGlyph agent="munshi" size={22} />
        <span>{chosen ? draft.explanation || "The Scribe matched this payment to an open slip." : draft.explanation}</span>
      </div>
      {chosen && (
        <div className="sheet p-1.5">
          <SlipRow slip={chosen} today={today} />
        </div>
      )}
      {draft.candidates.length > 0 && (
        <div>
          <p className="eyebrow mb-1">{chosen ? "Or was it one of these?" : "Open slips"}</p>
          <div className="flex flex-wrap gap-1.5">
            {draft.candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => setChosen(c)}
                className={clsx("rounded-full border px-3 py-1 text-[12.5px]", chosen?.id === c.id ? "border-mor bg-mor-soft" : "border-rule-2 bg-sheet hover:border-mor")}
              >
                {c.creditor.id === actorId ? c.debtor.name : c.creditor.name} · {rupees(c.amount)} · {c.code}
              </button>
            ))}
          </div>
        </div>
      )}
      {chosen && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[12px] text-ink-3">
            {iAmLender ? "Received on" : "Paid on"}
            <input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} className="hand mt-0.5 block rounded-xl border border-rule-2 bg-sheet px-3 py-1 text-[17px] text-mor-ink" />
          </label>
          <Button
            variant="primary"
            loading={busy === "record_payment"}
            onClick={async () => {
              const ok = await run(chosen, "record_payment", { paidOn }, iAmLender ? "Marked received — slip closed" : `Sent to ${chosen.creditor.name} to confirm`);
              if (ok) updateTurn(turn.id, { outcome: { kind: "paid", slip: chosen } });
            }}
          >
            <Check size={16} /> {iAmLender ? `Mark ${rupees(chosen.amount)} received` : `Record ${rupees(chosen.amount)} paid`}
          </Button>
          {!iAmLender && <p className="w-full text-[12px] text-ink-3">{chosen.creditor.name} will be asked to confirm the money arrived.</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- answers

function AnswerResult({ speech, cards, followUps, today }: { speech: string; cards: Extract<BoloResult, { kind: "answer" }>["cards"]; followUps: string[]; today: string }) {
  const { ask } = useApp();
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <AgentGlyph agent="khoji" size={30} />
        <div className="min-w-0 flex-1">
          <p className="text-[16.5px] leading-relaxed text-ink">{speech}</p>
          <button onClick={() => speak(speech)} className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-mor">
            <Volume2 size={13} /> Read aloud
          </button>
        </div>
      </div>
      {cards.map((c, i) => (
        <AnswerCardView key={i} card={c} today={today} />
      ))}
      {followUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {followUps.map((f) => (
            <button key={f} onClick={() => ask(f)} className="rounded-full border border-rule-2 bg-sheet px-3 py-1 text-[13px] text-ink-2 hover:border-mor hover:text-ink">
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Gawah

function ResponseResult({ turn, result, today }: { turn: Turn; result: Extract<BoloResult, { kind: "response" }>; today: string }) {
  const { actorId, updateTurn } = useApp();
  const { run, busy } = useSlipAction();
  const { data: live } = useSlip(result.slip?.id ?? null);
  const slip = live ?? result.slip;

  const said = (
    <div className="flex items-start gap-3">
      <AgentGlyph agent="gawah" size={28} />
      <p className="pt-0.5 text-[16px] leading-relaxed text-ink">{result.speech}</p>
    </div>
  );

  if (result.applied && slip) {
    return (
      <div className="space-y-4">
        {said}
        <Parchi {...parchiProps(slip, actorId)} />
      </div>
    );
  }

  if (turn.outcome && slip) {
    return (
      <div className="space-y-4">
        {said}
        <Parchi {...parchiProps(slip, actorId)} />
      </div>
    );
  }

  if (slip && slip.status === "awaiting" && (result.decision === "dispute" || result.decision === "counter")) {
    return (
      <div className="space-y-4">
        {said}
        <Parchi {...parchiProps(slip, actorId)} stampAnimate={false} />
        {result.reason && <p className="hand text-[17px]">Your reason: “{result.reason}”</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            loading={busy === "dispute"}
            onClick={async () => {
              const ok = await run(slip, "dispute", { reason: result.reason ?? "", amount: result.counterAmount }, result.counterAmount ? `Proposed ${rupees(result.counterAmount)}` : "Marked as disputed");
              if (ok) updateTurn(turn.id, { outcome: { kind: "disputed", slip } });
            }}
          >
            {result.counterAmount ? `Send ${rupees(result.counterAmount)} instead` : "Send dispute"}
          </Button>
          <Button
            variant="secondary"
            loading={busy === "confirm"}
            onClick={async () => {
              const ok = await run(slip, "confirm", {}, "Stamped — it's on record");
              if (ok) updateTurn(turn.id, { outcome: { kind: "stamped", slip } });
            }}
          >
            Actually, confirm {rupees(slip.amount)}
          </Button>
        </div>
      </div>
    );
  }

  const list = slip ? [slip, ...result.candidates] : result.candidates;
  return (
    <div className="space-y-3">
      {said}
      {list.length > 0 && (
        <div className="sheet p-1.5">
          {list.map((c) => (
            <SlipRow
              key={c.id}
              slip={c}
              today={today}
              actions={
                c.status === "awaiting" ? (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={busy === "confirm"}
                    onClick={async () => {
                      const ok = await run(c, "confirm", {}, "Stamped — it's on record");
                      if (ok) updateTurn(turn.id, { outcome: { kind: "stamped", slip: c } });
                    }}
                  >
                    Confirm
                  </Button>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Dakiya

function ReminderResult({ turn, slip, message, tone }: { turn: Turn; slip: SlipView; message: string; tone: string }) {
  const { actorId, updateTurn, toast, refreshAll } = useApp();
  const [msg, setMsg] = useState(message);
  const [busy, setBusy] = useState(false);
  const sent = turn.outcome?.kind === "reminded";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <AgentGlyph agent="dakiya" size={22} />
        <span>
          The Messenger wrote a <b>{tone}</b> reminder for {rupees(slip.amount)}{" "}
          {slip.daysToDue < 0 ? `(${-slip.daysToDue} days overdue)` : `(due ${prettyDay(slip.dueDate, false)})`}.
        </span>
      </div>
      <Postcard to={slip.debtor.name} from={slip.creditor.name} tone={tone} message={msg} editable={!sent} onChange={setMsg} />
      {sent ? (
        <p className="flex items-center gap-2 text-[13.5px] text-neem">
          <Check size={15} /> Delivered to {slip.debtor.name}&apos;s Saakh inbox.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await postJSON(`/api/slips/${slip.id}/remind`, { actorId, message: msg, tone });
                updateTurn(turn.id, { outcome: { kind: "reminded", slip } });
                toast({ agent: "dakiya", title: `Reminder sent to ${slip.debtor.name}` });
                refreshAll();
              } catch (e) {
                toast({ title: "Couldn't send", body: (e as Error).message, tone: "bad" });
              } finally {
                setBusy(false);
              }
            }}
          >
            <Send size={15} /> Send reminder
          </Button>
          <a
            className="inline-flex h-10 items-center gap-2 rounded-full border border-rule-2 bg-sheet px-4 text-[14px] font-medium text-ink hover:border-ink-3"
            href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}

function MessageResult({ text, suggestions }: { text: string; suggestions: string[] }) {
  const { ask } = useApp();
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <AgentGlyph agent="sutradhar" size={28} />
        <p className="pt-0.5 text-[16px] text-ink">{text}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button key={s} onClick={() => ask(s)} className="hand rounded-full border border-rule-2 bg-sheet px-3 py-1 text-[15px] hover:border-mor">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
