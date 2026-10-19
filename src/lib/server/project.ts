// Folds the event log into the current state of the world, as of a moment on
// the Saakh clock. Events stamped after that moment are ignored, which is what
// makes the time machine work in both directions.

import type { Business, SlipStatus, TimelineItem } from "@/lib/shared/types";
import { istDay } from "@/lib/shared/dates";
import type { LakeEvent } from "./store";

export interface SlipState {
  id: string;
  code: string;
  creditorId: string;
  debtorId: string;
  amount: number;
  originalAmount: number;
  dueDate: string;
  note: string;
  raisedBy: "creditor" | "debtor";
  raisedAt: string;
  source: "voice" | "text" | "form" | "seed";
  utterance?: string;
  status: SlipStatus;
  confirmedAt?: string;
  dispute?: { reason: string; at: string; counterAmount?: number; by: string };
  payment?: { paidOn: string; amount: number; recordedBy: "creditor" | "debtor"; acknowledged: boolean; at: string };
  reminders: { at: string; message: string; tone: string }[];
  confirmationMessages: { at: string; message: string; to: string }[];
  penaltiesAssessed: number[];
  timeline: TimelineItem[];
}

export interface World {
  asOf: string;
  today: string;
  businesses: Map<string, Business>;
  slips: Map<string, SlipState>;
  events: LakeEvent[];
}

type D = Record<string, unknown>;

export function project(all: LakeEvent[], asOf: string): World {
  const events = all
    .filter((e) => e.at <= asOf)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.seq - b.seq));

  const businesses = new Map<string, Business>();
  const slips = new Map<string, SlipState>();
  const name = (id: string) => businesses.get(id)?.name ?? id;

  for (const e of events) {
    const d = e.data as D;
    const slip = typeof d.slipId === "string" ? slips.get(d.slipId) : undefined;
    const note = (kind: string, text: string) =>
      slip?.timeline.push({ at: e.at, kind, actor: e.actor, text });

    switch (e.type) {
      case "business.registered": {
        businesses.set(d.id as string, d as unknown as Business);
        break;
      }
      case "slip.raised": {
        const s: SlipState = {
          id: d.slipId as string,
          code: d.code as string,
          creditorId: d.creditorId as string,
          debtorId: d.debtorId as string,
          amount: d.amount as number,
          originalAmount: d.amount as number,
          dueDate: d.dueDate as string,
          note: (d.note as string) ?? "",
          raisedBy: d.raisedBy as "creditor" | "debtor",
          raisedAt: e.at,
          source: (d.source as SlipState["source"]) ?? "form",
          utterance: d.utterance as string | undefined,
          status: "awaiting",
          reminders: [],
          confirmationMessages: [],
          penaltiesAssessed: [],
          timeline: [],
        };
        const raiser = s.raisedBy === "creditor" ? s.creditorId : s.debtorId;
        s.timeline.push({
          at: e.at,
          kind: "raised",
          actor: raiser,
          text:
            s.raisedBy === "creditor"
              ? `${name(s.creditorId)} recorded that ${name(s.debtorId)} owes this`
              : `${name(s.debtorId)} recorded owing this to ${name(s.creditorId)}`,
        });
        slips.set(s.id, s);
        break;
      }
      case "confirmation.requested": {
        if (!slip) break;
        slip.confirmationMessages.push({ at: e.at, message: d.message as string, to: d.to as string });
        note("asked", `Gawah asked ${name(d.to as string)} to confirm`);
        break;
      }
      case "slip.confirmed": {
        if (!slip) break;
        slip.status = "confirmed";
        slip.confirmedAt = e.at;
        note("confirmed", `${name(d.by as string)} confirmed — both sides agree`);
        break;
      }
      case "slip.disputed": {
        if (!slip) break;
        const counter = d.counterAmount as number | undefined;
        slip.status = counter ? "countered" : "disputed";
        slip.dispute = { reason: (d.reason as string) ?? "", at: e.at, counterAmount: counter, by: d.by as string };
        note(counter ? "countered" : "disputed", counter
          ? `${name(d.by as string)} says the amount should be ₹${counter.toLocaleString("en-IN")}`
          : `${name(d.by as string)} disputed this slip`);
        break;
      }
      case "slip.counter_accepted": {
        if (!slip) break;
        slip.amount = d.amount as number;
        slip.status = "confirmed";
        slip.confirmedAt = e.at;
        note("confirmed", `${name(d.by as string)} accepted the revised amount — both sides agree`);
        break;
      }
      case "slip.withdrawn": {
        if (!slip) break;
        slip.status = "withdrawn";
        note("withdrawn", `${name(d.by as string)} withdrew the slip`);
        break;
      }
      case "payment.recorded": {
        if (!slip) break;
        const role = d.role as "creditor" | "debtor";
        slip.payment = {
          paidOn: d.paidOn as string,
          amount: d.amount as number,
          recordedBy: role,
          acknowledged: role === "creditor",
          at: e.at,
        };
        if (role === "creditor") slip.status = "paid";
        note("payment", role === "creditor"
          ? `${name(slip.creditorId)} marked it received`
          : `${name(slip.debtorId)} says it was paid on ${d.paidOn}`);
        break;
      }
      case "payment.acknowledged": {
        if (!slip || !slip.payment) break;
        slip.payment.acknowledged = true;
        slip.status = "paid";
        note("paid", `${name(slip.creditorId)} confirmed receiving the money`);
        break;
      }
      case "payment.rejected": {
        if (!slip) break;
        slip.payment = undefined;
        note("payment_rejected", `${name(slip.creditorId)} says the money hasn't arrived`);
        break;
      }
      case "reminder.sent": {
        if (!slip) break;
        slip.reminders.push({ at: e.at, message: d.message as string, tone: (d.tone as string) ?? "gentle" });
        note("reminder", `Dakiya sent a ${d.tone ?? "gentle"} reminder to ${name(slip.debtorId)}`);
        break;
      }
      case "penalty.assessed": {
        if (!slip) break;
        slip.penaltiesAssessed.push(d.month as number);
        note("penalty", `Chowkidar took 1 point off ${name(slip.debtorId)} — month ${d.month} late`);
        break;
      }
    }
  }

  return { asOf, today: istDay(asOf), businesses, slips, events };
}
