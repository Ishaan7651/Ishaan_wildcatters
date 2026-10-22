// Gawah — the witness. Asks the other side to confirm every new slip, and
// understands their reply ("haan sahi hai", "only 1,500", "never ordered").

import type { BoloResult, Business } from "@/lib/shared/types";
import { rupees } from "@/lib/shared/money";
import type { World } from "../project";
import { findMentioned } from "../match";
import { confirmerOf, getWorld, raiserOf, slipById, slipView } from "../views";
import { appendEvents } from "../store";
import { confirmSlip } from "../commands";
import { chat, hasKey, tool } from "../ai/openrouter";
import { isNegative, parseAmount } from "../ai/offline";
import { RunRecorder, runAgent } from "../ai/runtime";
import { toConfirmTool } from "../ai/tools";
import { confirmationMessage } from "../templates";
import { contextBlock } from "./context";

const DECIDE = tool("submit_decision", "Submit how the user answered a slip waiting for their confirmation.", {
  slip_id: { type: "string", description: "slip_id from list_slips_to_confirm, or empty if unclear which." },
  decision: { type: "string", enum: ["confirm", "dispute", "counter", "unclear"], description: "counter = they agree they owe something, but a different amount." },
  counter_amount: { type: "number", description: "Rupees they say they actually owe (counter only), else 0." },
  reason: { type: "string", description: "Their reason in a few words (dispute/counter), else empty." },
  speech: { type: "string", description: "One short sentence back to the user, in their language." },
}, ["slip_id", "decision", "counter_amount", "reason", "speech"]);

export async function interpretReply(rec: RunRecorder, world: World, actor: Business, utterance: string): Promise<BoloResult> {
  const pending = [...world.slips.values()].filter((s) => s.status === "awaiting" && confirmerOf(s) === actor.id);
  const candidates = pending.map((s) => slipView(world, s));
  if (!pending.length) {
    rec.step("gawah", "think", "Nothing is waiting for your confirmation");
    return { kind: "response", applied: false, decision: "unclear", slip: null, candidates: [], speech: "Nothing is waiting for your confirmation right now." };
  }

  let slipId = "";
  let decision: "confirm" | "dispute" | "counter" | "unclear" = "unclear";
  let counter = 0;
  let reason = "";
  let speech = "";

  if (hasKey() && rec.mode === "ai") {
    try {
      const out = await runAgent({
        rec,
        agent: "gawah",
        system: `You are the Witness inside Saakh. Other businesses have recorded debts against the user, and the user is now answering one of them. List the waiting slips, work out which one they mean (by business, amount or note — if only one is waiting, it's that one), and what they decided.\n${contextBlock(world, actor)}`,
        user: utterance,
        tools: [toConfirmTool(world, actor.id)],
        final: DECIDE,
        maxTurns: 3,
      });
      slipId = String(out.slip_id ?? "");
      decision = (["confirm", "dispute", "counter", "unclear"].includes(String(out.decision)) ? out.decision : "unclear") as typeof decision;
      counter = Number(out.counter_amount) || 0;
      reason = String(out.reason ?? "");
      speech = String(out.speech ?? "");
    } catch (e) {
      rec.step("gawah", "error", "Model failed — read the reply by rules", (e as Error).message.slice(0, 160));
      rec.mode = "offline";
    }
  }

  if (rec.mode === "offline") {
    const hit = findMentioned(world, utterance, actor.id);
    const amount = parseAmount(utterance, null);
    const pick =
      pending.find((s) => hit && raiserOf(s) === hit.b.id && (!amount || s.amount === amount)) ??
      pending.find((s) => hit && raiserOf(s) === hit.b.id) ??
      pending.find((s) => amount && s.amount === amount) ??
      (pending.length === 1 ? pending[0] : undefined);
    rec.step("gawah", "tool", "list_slips_to_confirm", `${pending.length} waiting${pick ? ` · matched ${pick.code}` : ""}`);
    slipId = pick?.id ?? "";
    if (pick && amount && amount !== pick.amount && !isNegative(utterance)) {
      decision = "counter";
      counter = amount;
    } else decision = isNegative(utterance) ? "dispute" : pick ? "confirm" : "unclear";
    reason = decision === "dispute" ? utterance.slice(0, 120) : "";
  }

  const target = pending.find((s) => s.id === slipId);
  if (!target) {
    rec.step("gawah", "think", "Couldn't tell which slip you meant");
    return { kind: "response", applied: false, decision: "unclear", slip: null, candidates, speech: speech || "Which slip do you mean? Pick one below." };
  }

  const raiser = world.businesses.get(raiserOf(target))!.name;
  if (decision === "confirm") {
    await confirmSlip(actor.id, target.id);
    const fresh = slipById(getWorld(), target.id);
    rec.step("gawah", "write", "stamp_slip", `${target.code} confirmed · ${rupees(target.amount)} to ${raiser}`);
    return {
      kind: "response",
      applied: true,
      decision,
      slip: fresh,
      candidates: [],
      speech: speech || `Done — ${rupees(target.amount)} with ${raiser} is now confirmed and on record.`,
    };
  }

  rec.step("gawah", "think", decision === "counter" ? `You say it's ${rupees(counter)}, not ${rupees(target.amount)}` : decision === "dispute" ? "You don't agree with this slip" : "Unclear answer");
  return {
    kind: "response",
    applied: false,
    decision,
    slip: slipView(world, target),
    candidates: candidates.filter((c) => c.id !== target.id),
    reason,
    counterAmount: decision === "counter" ? counter : undefined,
    speech:
      speech ||
      (decision === "counter"
        ? `I'll tell ${raiser} you owe ${rupees(counter)}, not ${rupees(target.amount)}. Tap to send.`
        : decision === "dispute"
          ? `I'll mark ${raiser}'s slip as disputed. Tap to send.`
          : "Do you agree with this slip?"),
  };
}

/** After a slip is raised: write to the other side and ask them to confirm. */
export async function requestConfirmation(slipId: string) {
  const world = getWorld();
  const s = world.slips.get(slipId);
  if (!s || s.status !== "awaiting") return;
  const raiser = world.businesses.get(raiserOf(s))!;
  const confirmer = world.businesses.get(confirmerOf(s))!;
  const rec = new RunRecorder("gawah", "New slip", raiser.id);
  rec.step("gawah", "tool", "compose_request", `${raiser.name} → ${confirmer.name}`);
  let message = confirmationMessage({ raiser: raiser.name, amount: s.amount, dueDate: s.dueDate, note: s.note, raisedBy: s.raisedBy });

  if (hasKey()) {
    try {
      const res = await chat({
        maxTokens: 160,
        temperature: 0.5,
        timeoutMs: 12_000,
        messages: [
          {
            role: "system",
            content:
              "You are the Witness inside Saakh, a shared debt ledger for Indian small businesses. Write the short message asking a business owner to confirm a debt someone recorded. Two sentences max, warm and plain, address them by first name with 'ji', use ₹ with Indian digit grouping, say the slip only counts once they agree. A light touch of Hinglish is fine. No emojis, no markdown.",
          },
          {
            role: "user",
            content: `To: ${confirmer.owner} (${confirmer.name}). From: ${raiser.name}. ${s.raisedBy === "creditor" ? `${raiser.name} says ${confirmer.name} owes them` : `${raiser.name} says they owe ${confirmer.name}`} ₹${s.amount.toLocaleString("en-IN")}${s.note ? ` for ${s.note}` : ""}, due ${s.dueDate}.`,
          },
        ],
      });
      rec.tokens += res.tokens;
      rec.model = res.model;
      if (res.message.content?.trim()) message = res.message.content.trim();
    } catch (e) {
      rec.step("gawah", "error", "Model failed — used the standard wording", (e as Error).message.slice(0, 120));
      rec.mode = "offline";
    }
  } else rec.mode = "offline";

  await appendEvents([{ type: "confirmation.requested", actor: "agent:gawah", data: { slipId, to: confirmer.id, message, agent: "gawah" } }]);
  rec.step("gawah", "write", `deliver → ${confirmer.name}`, message.slice(0, 120));
  await rec.finish(`Asked ${confirmer.name} to confirm ${rupees(s.amount)} from ${raiser.name}.`);
}
