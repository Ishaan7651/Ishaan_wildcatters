// "Bolo" (speak) — the one box for everything. Sutradhar routes; the right
// agent does the work; every step streams back to the screen as it happens.

import type { BoloEvent, BoloResult, Intent } from "@/lib/shared/types";
import { prettyDay } from "@/lib/shared/dates";
import { getWorld } from "../views";
import { hasKey } from "../ai/openrouter";
import { RunRecorder } from "../ai/runtime";
import { AGENT_FOR } from "./context";
import { route } from "./sutradhar";
import { draftPayment, draftSlip } from "./munshi";
import { interpretReply } from "./gawah";
import { answer } from "./khoji";
import { draftFromRequest } from "./dakiya";

export async function bolo(
  input: { utterance: string; actorId: string; source: "voice" | "text" },
  emit: (e: BoloEvent) => void,
) {
  const world = getWorld();
  const actor = world.businesses.get(input.actorId);
  if (!actor) {
    emit({ type: "error", message: "Pick which business you are first." });
    return;
  }
  const rec = new RunRecorder("sutradhar", `${input.source === "voice" ? "Voice" : "Text"} · ${actor.name}`, actor.id, (step) =>
    emit({ type: "step", step }),
  );
  rec.mode = hasKey() ? "ai" : "offline";

  let intent: Intent = "help";
  let result: BoloResult;
  try {
    intent = await route(rec, world, actor, input.utterance);
    rec.agent = AGENT_FOR[intent];
    switch (intent) {
      case "record":
        result = { kind: "slip_draft", draft: await draftSlip(rec, world, actor, input.utterance) };
        break;
      case "payment":
        result = { kind: "payment_draft", draft: await draftPayment(rec, world, actor, input.utterance) };
        break;
      case "query":
        result = await answer(rec, world, actor, input.utterance);
        break;
      case "respond":
        result = await interpretReply(rec, world, actor, input.utterance);
        break;
      case "remind":
        result = await draftFromRequest(rec, world, actor, input.utterance);
        break;
      default:
        result = {
          kind: "message",
          text: "Tell me about money owed — or ask about anyone's score. For example:",
          suggestions: [
            "Sharma Traders owes me ₹2,000 by 31 October",
            "Check the score for Sharma Traders and how many payments are pending",
            "I owe Ganga Packaging 12,000 in 15 days",
          ],
        };
    }
  } catch (e) {
    rec.step(rec.agent, "error", "Something went wrong", (e as Error).message.slice(0, 200));
    rec.finish(`Failed: ${(e as Error).message.slice(0, 120)}`, "error");
    emit({ type: "error", message: "That didn't work — try saying it another way." });
    return;
  }

  emit({ type: "result", intent, result });
  const run = rec.finish(summarise(intent, result));
  emit({ type: "done", runId: run.id, ms: run.durationMs, mode: rec.mode });
}

function summarise(intent: Intent, r: BoloResult): string {
  switch (r.kind) {
    case "slip_draft": {
      const d = r.draft;
      const who = d.counterparty.name || "someone";
      return `Drafted a slip: ${d.direction === "they_owe_me" ? `${who} owes ₹${d.amount?.toLocaleString("en-IN") ?? "?"}` : `you owe ${who} ₹${d.amount?.toLocaleString("en-IN") ?? "?"}`}, due ${d.dueDate ? prettyDay(d.dueDate) : "?"}.`;
    }
    case "payment_draft":
      return r.draft.slip ? `Matched a payment to ${r.draft.slip.code}.` : "Couldn't match the payment to an open slip.";
    case "answer":
      return r.speech.slice(0, 180);
    case "response":
      return r.applied ? `Confirmed ${r.slip?.code}.` : `Prepared a ${r.decision} for ${r.slip?.code ?? "a slip"}.`;
    case "reminder_draft":
      return `Drafted a ${r.tone} reminder to ${r.slip.debtor.name}.`;
    default:
      return intent === "help" ? "Explained what Saakh can do." : r.text.slice(0, 120);
  }
}
