// Munshi — the scribe. Turns a sentence into a filled slip, or matches a
// payment to the right open slip. It proposes; the user taps once to send.

import type { Business, PaymentDraft, SlipDraft } from "@/lib/shared/types";
import { addDays, prettyDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import type { World } from "../project";
import { findMentioned, searchBusinesses } from "../match";
import { slipById, slipsFor } from "../views";
import { hasKey, tool } from "../ai/openrouter";
import { parseAmount, parseDirection, parseDue } from "../ai/offline";
import { runAgent, type RunRecorder } from "../ai/runtime";
import { findBusinessTool, openSlipsTool } from "../ai/tools";
import { contextBlock } from "./context";

const PROPOSE_SLIP = tool("propose_slip", "Submit the filled slip for the user to send with one tap.", {
  direction: { type: "string", enum: ["they_owe_me", "i_owe_them"] },
  counterparty_business_id: { type: "string", description: "business_id from find_business, or empty string if they're not on Saakh yet." },
  counterparty_name: { type: "string", description: "Proper business name (from find_business), or the name as said, title-cased." },
  amount_inr: { type: "number", description: "Rupees. 0 if no amount was said." },
  due_date: { type: "string", description: "YYYY-MM-DD" },
  due_date_assumed: { type: "boolean", description: "true if the user gave no due date and you assumed one." },
  due_date_reason: { type: "string", description: "How you got the date, under 8 words, e.g. “by 31st” → 31 Oct." },
  note: { type: "string", description: "What the debt is for (goods / invoice), under 8 words. Empty if not said." },
  questions: { type: "array", items: { type: "string" }, description: "At most 2 short things the user should double-check. Empty if clear." },
}, ["direction", "counterparty_business_id", "counterparty_name", "amount_inr", "due_date", "due_date_assumed", "due_date_reason", "note", "questions"]);

const SLIP_RULES = `Rules:
- Direction: "X owes me", "X se lena hai", "gave X on credit/udhaar" → they_owe_me. "I owe X", "X ko dena hai", "took goods from X on credit" → i_owe_them.
- Amounts: 2k = 2000, "do hazaar" = 2000, "dhai hazaar" = 2500, "dedh lakh" = 150000, "1.2 lakh" = 120000, "sava" = ×1.25, "paune" = ×0.75.
- Dates: "by the 31st" = the next 31st that hasn't passed. "15 din mein" / "in 15 days" = today + 15. "next week" = today + 7. "month end" = last day of this month. Diwali 2026 = 2026-11-08. If no date is said, use today + 30 days and set due_date_assumed = true.
- Always call find_business for the other party first, even if the name looks complete. Use the best match if its match score is ≥ 0.6; otherwise treat them as new (empty business_id).
- The other party can never be the user's own business.
- questions: only for real doubts (an unclear amount, two equally likely businesses, an ambiguous date). Don't ask to double-check a name that matched at ≥ 0.8, and don't mention that a business is new — the app shows that itself.`;

export async function draftSlip(rec: RunRecorder, world: World, actor: Business, utterance: string): Promise<SlipDraft> {
  if (hasKey() && rec.mode === "ai") {
    try {
      const out = await runAgent({
        rec,
        agent: "munshi",
        system: `You are Munshi, the scribe inside Saakh. You turn what the user said into a debt slip.\n${contextBlock(world, actor)}\n${SLIP_RULES}`,
        user: utterance,
        tools: [findBusinessTool(world)],
        final: PROPOSE_SLIP,
        maxTurns: 4,
      });
      return finishDraft(rec, world, actor, utterance, {
        direction: out.direction === "i_owe_them" ? "i_owe_them" : "they_owe_me",
        id: String(out.counterparty_business_id ?? ""),
        name: String(out.counterparty_name ?? ""),
        amount: Number(out.amount_inr) || null,
        due: String(out.due_date ?? ""),
        assumed: !!out.due_date_assumed,
        reason: String(out.due_date_reason ?? ""),
        note: String(out.note ?? ""),
        questions: Array.isArray(out.questions) ? out.questions.map(String).slice(0, 2) : [],
      });
    } catch (e) {
      rec.step("munshi", "error", "Model failed — filled the slip by rules", (e as Error).message.slice(0, 160));
      rec.mode = "offline";
    }
  }
  return offlineDraft(rec, world, actor, utterance);
}

function offlineDraft(rec: RunRecorder, world: World, actor: Business, utterance: string): SlipDraft {
  const due = parseDue(utterance, world.today);
  const amount = parseAmount(utterance, due.span);
  const direction = parseDirection(utterance);
  const hit = findMentioned(world, utterance, actor.id);
  rec.step("munshi", "tool", "find_business (in sentence)", hit ? `${hit.b.name} · ${hit.score.toFixed(2)}` : "no known business named");
  let name = hit?.b.name ?? "";
  if (!hit) {
    const m =
      utterance.match(/^\s*([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})\s+(?:owes|ko|se|has|needs)/) ??
      utterance.match(/\bi owe\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/i);
    name = m ? m[1].trim() : "";
  }
  const noteMatch = utterance.match(/\bfor\s+(?:the\s+)?(\w[\w\s&-]{2,40}?)(?:[,.]|\s+by\b|\s+due\b|\s+in\b|\s+within\b|$)/i);
  return finishDraft(rec, world, actor, utterance, {
    direction,
    id: hit?.b.id ?? "",
    name,
    amount,
    due: due.date,
    assumed: due.assumed,
    reason: due.reason,
    note: noteMatch ? noteMatch[1].trim() : "",
    questions: [],
  });
}

function finishDraft(
  rec: RunRecorder,
  world: World,
  actor: Business,
  utterance: string,
  p: { direction: SlipDraft["direction"]; id: string; name: string; amount: number | null; due: string; assumed: boolean; reason: string; note: string; questions: string[] },
): SlipDraft {
  const known = p.id && p.id !== actor.id ? world.businesses.get(p.id) : undefined;
  const name = known?.name ?? p.name.trim();
  const due = /^\d{4}-\d{2}-\d{2}$/.test(p.due) ? p.due : addDays(world.today, 30);
  const alternatives = name
    ? searchBusinesses(world, name, 4)
        .filter(({ b, score }) => b.id !== known?.id && b.id !== actor.id && score >= 0.55)
        .slice(0, 3)
        .map(({ b }) => ({ id: b.id, name: b.name, city: b.city }))
    : [];
  const questions = [...p.questions];
  if (!name) questions.unshift("Who is this slip with?");
  if (!p.amount) questions.unshift("How much is it for?");
  if (name && !known) questions.push(`${name} isn't on Saakh yet — sending this invites them.`);
  const draft: SlipDraft = {
    direction: p.direction,
    counterparty: { id: known?.id, name, isNew: !known && !!name, city: known?.city },
    alternatives,
    amount: p.amount && p.amount > 0 ? Math.round(p.amount) : null,
    dueDate: due,
    dueAssumed: p.assumed,
    dueReason: p.reason || (p.assumed ? "Assumed 30 days" : "From what you said"),
    note: p.note,
    questions: [...new Set(questions)].slice(0, 3),
    utterance,
  };
  rec.step(
    "munshi",
    "write",
    "propose_slip",
    `${draft.direction === "they_owe_me" ? `${name || "?"} owes you` : `You owe ${name || "?"}`} ${draft.amount ? rupees(draft.amount) : "₹?"} · due ${prettyDay(due, false)}`,
  );
  return draft;
}

// ---- Payments ----

const PROPOSE_PAYMENT = tool("propose_payment", "Submit which open slip was paid, and when.", {
  slip_id: { type: "string", description: "slip_id from list_open_slips, or empty if none fits." },
  paid_on: { type: "string", description: "YYYY-MM-DD — today unless the user said otherwise. Never in the future." },
  explanation: { type: "string", description: "One short sentence on which slip you matched and why." },
}, ["slip_id", "paid_on", "explanation"]);

export async function draftPayment(rec: RunRecorder, world: World, actor: Business, utterance: string): Promise<PaymentDraft> {
  if (hasKey() && rec.mode === "ai") {
    try {
      const out = await runAgent({
        rec,
        agent: "munshi",
        system: `You are Munshi, the scribe inside Saakh. The user is reporting a payment against an existing debt. Find the other business, list the open slips with them, and pick the one that was paid (match the amount if given; otherwise the oldest due).\n${contextBlock(world, actor)}`,
        user: utterance,
        tools: [findBusinessTool(world), openSlipsTool(world, actor.id)],
        final: PROPOSE_PAYMENT,
        maxTurns: 5,
      });
      return finishPayment(rec, world, actor, String(out.slip_id ?? ""), String(out.paid_on ?? ""), String(out.explanation ?? ""));
    } catch (e) {
      rec.step("munshi", "error", "Model failed — matched the payment by rules", (e as Error).message.slice(0, 160));
      rec.mode = "offline";
    }
  }
  const hit = findMentioned(world, utterance, actor.id);
  rec.step("munshi", "tool", "find_business (in sentence)", hit ? hit.b.name : "no business named");
  const open = slipsFor(world, actor.id).filter((v) => v.status === "confirmed" && (!hit || v.creditor.id === hit.b.id || v.debtor.id === hit.b.id));
  const amount = parseAmount(utterance, null);
  const pick = open.find((v) => amount && v.amount === amount) ?? open.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
  const paidOn = /yesterday|\bkal\b/i.test(utterance) ? addDays(world.today, -1) : world.today;
  return finishPayment(rec, world, actor, pick?.id ?? "", paidOn, pick ? "Matched the oldest open slip with them." : "");
}

function finishPayment(rec: RunRecorder, world: World, actor: Business, slipId: string, paidOn: string, explanation: string): PaymentDraft {
  const slip = slipId ? slipById(world, slipId) : null;
  const valid = slip && slip.status === "confirmed" && (slip.creditor.id === actor.id || slip.debtor.id === actor.id) ? slip : null;
  const other = valid ? (valid.creditor.id === actor.id ? valid.debtor.id : valid.creditor.id) : null;
  const candidates = slipsFor(world, actor.id)
    .filter((v) => v.status === "confirmed" && v.id !== valid?.id && (!other || v.creditor.id === other || v.debtor.id === other))
    .slice(0, 4);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(paidOn) && paidOn <= world.today ? paidOn : world.today;
  rec.step("munshi", "write", "propose_payment", valid ? `${valid.code} · ${rupees(valid.amount)} · paid ${prettyDay(day, false)}` : "no matching open slip");
  return {
    slip: valid,
    candidates,
    paidOn: day,
    amount: valid?.amount ?? null,
    role: valid && valid.creditor.id === actor.id ? "creditor" : "debtor",
    explanation: explanation || (valid ? "" : "I couldn't find an open slip that matches. Pick one below."),
  };
}
