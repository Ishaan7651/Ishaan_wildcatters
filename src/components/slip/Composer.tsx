"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import type { SlipView } from "@/lib/shared/types";
import { addDays, istDay } from "@/lib/shared/dates";
import { rupeesInWords } from "@/lib/shared/money";
import { postJSON, useAppState, useBusinesses } from "@/lib/client/api";
import { useApp, type ComposerPrefill } from "@/components/providers/Providers";
import { Sheet } from "@/components/ui/overlay";
import { Avatar, Button, ScoreChip } from "@/components/ui/primitives";

export interface RaisePayload {
  direction: "they_owe_me" | "i_owe_them";
  counterpartyId?: string;
  newCounterparty?: { name: string; city?: string };
  amount: number;
  dueDate: string;
  note?: string;
  source: "voice" | "text" | "form";
  utterance?: string;
}

export function useRaiseSlip() {
  const { actorId, toast, refreshAll } = useApp();
  const [busy, setBusy] = useState(false);
  const raise = async (p: RaisePayload) => {
    setBusy(true);
    try {
      const r = await postJSON<{ slip: SlipView; invited: boolean }>("/api/slips", { actorId, ...p });
      const other = p.direction === "they_owe_me" ? r.slip.debtor.name : r.slip.creditor.name;
      toast({
        agent: "gawah",
        title: `Sent to ${other} for confirmation`,
        body: r.invited ? `${other} isn't on Saakh yet — Gawah sent them an invite with the slip.` : "Gawah is asking them to confirm. It counts once they agree.",
      });
      await refreshAll();
      return r.slip;
    } catch (e) {
      toast({ title: "Couldn't send the slip", body: (e as Error).message, tone: "bad" });
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { raise, busy };
}

/** The no-voice way in: a plain form that writes the same parchi. */
export function Composer() {
  const { composer, openComposer, actorId } = useApp();
  const { data: state } = useAppState(actorId);
  const today = state?.clock.today ?? istDay();
  return (
    <Sheet open={!!composer} onClose={() => openComposer(null)} width={500} title={<span className="display text-[17px] font-semibold">Write a slip</span>}>
      {composer && <ComposerForm prefill={composer} today={today} />}
    </Sheet>
  );
}

function ComposerForm({ prefill, today }: { prefill: ComposerPrefill; today: string }) {
  const { openComposer, actorId, openSlip } = useApp();
  const { data: list } = useBusinesses();
  const [direction, setDirection] = useState<"they_owe_me" | "i_owe_them">(prefill.direction ?? "they_owe_me");
  const [party, setParty] = useState<string>(prefill.counterpartyId ?? "");
  const [q, setQ] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(() => addDays(today, 30));
  const [note, setNote] = useState("");
  const { raise, busy } = useRaiseSlip();

  const options = useMemo(
    () => (list ?? []).filter((b) => b.id !== actorId && (!q || `${b.name} ${b.owner} ${b.city}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 6),
    [list, q, actorId],
  );
  const chosen = list?.find((b) => b.id === party);
  const amt = Number(amount);
  const canSend = (party || q.trim().length > 1) && amt > 0 && due;

  return (
      <form
        className="space-y-5 px-5 pt-5 pb-8"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canSend) return;
          const slip = await raise({
            direction,
            counterpartyId: party || undefined,
            newCounterparty: party ? undefined : { name: q.trim() },
            amount: amt,
            dueDate: due,
            note,
            source: "form",
          });
          if (slip) {
            openComposer(null);
            openSlip(slip.id);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-1 rounded-full bg-paper-deep p-1">
          {(
            [
              ["they_owe_me", "They owe me"],
              ["i_owe_them", "I owe them"],
            ] as const
          ).map(([v, l]) => (
            <button
              type="button"
              key={v}
              onClick={() => setDirection(v)}
              className={clsx("rounded-full py-2 text-[14px] font-medium", direction === v ? "bg-sheet text-ink shadow-[var(--shadow-sheet)]" : "text-ink-3")}
            >
              {l}
            </button>
          ))}
        </div>

        <div>
          <label className="eyebrow" htmlFor="party">Business</label>
          {chosen ? (
            <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-carbon/40 bg-carbon-soft/50 px-3 py-2">
              <Avatar id={chosen.id} name={chosen.name} size={32} />
              <span className="flex-1 text-[14px] font-semibold">{chosen.name}</span>
              <ScoreChip score={chosen.score} band={chosen.band} />
              <button type="button" className="text-[12px] text-carbon" onClick={() => setParty("")}>
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                id="party"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search, or type a new business name"
                className="mt-1.5 w-full rounded-xl border border-rule-2 bg-sheet px-3 py-2.5 text-[15px] outline-none focus:border-carbon"
                autoComplete="off"
              />
              <ul className="mt-1.5 space-y-0.5">
                {options.map((b) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => setParty(b.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-paper-deep">
                      <Avatar id={b.id} name={b.name} size={28} />
                      <span className="flex-1 truncate text-[14px]">
                        {b.name} <span className="text-ink-3">· {b.city}</span>
                      </span>
                      <ScoreChip score={b.score} band={b.band} />
                    </button>
                  </li>
                ))}
                {q.trim().length > 1 && !options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase()) && (
                  <li className="px-2 pt-1 text-[12.5px] text-ink-3">
                    Not listed? Sending invites <b className="text-ink">{q.trim()}</b> to Saakh with this slip.
                  </li>
                )}
              </ul>
            </>
          )}
        </div>

        <div>
          <label className="eyebrow" htmlFor="amount">Amount</label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-rule-2 bg-sheet px-3 py-1.5 focus-within:border-carbon">
            <span className="hand text-[26px]">₹</span>
            <input
              id="amount"
              inputMode="numeric"
              value={amount ? Number(amount).toLocaleString("en-IN") : ""}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 9))}
              placeholder="2,000"
              className="hand w-full bg-transparent text-[28px] outline-none"
            />
          </div>
          {amt > 0 && <p className="mt-1 text-[12px] text-ink-3 italic">{rupeesInWords(amt)}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="eyebrow" htmlFor="due">Due by</label>
            <input
              id="due"
              type="date"
              value={due}
              min={addDays(today, -365)}
              onChange={(e) => setDue(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-rule-2 bg-sheet px-3 py-2.5 text-[15px] outline-none focus:border-carbon"
            />
          </div>
          <div>
            <label className="eyebrow" htmlFor="note">For (optional)</label>
            <input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="50 kg jeera"
              className="mt-1.5 w-full rounded-xl border border-rule-2 bg-sheet px-3 py-2.5 text-[15px] outline-none focus:border-carbon"
            />
          </div>
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!canSend} loading={busy}>
          Send for confirmation
        </Button>
        <p className="text-center text-[12px] text-ink-3">The other side gets it in their inbox. It only counts once they agree.</p>
      </form>
  );
}
