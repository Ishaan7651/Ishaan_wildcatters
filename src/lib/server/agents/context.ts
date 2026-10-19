import type { AgentName, Business, Intent } from "@/lib/shared/types";
import { weekdayDay } from "@/lib/shared/dates";
import type { World } from "../project";

export const AGENT_FOR: Record<Intent, AgentName> = {
  record: "munshi",
  payment: "munshi",
  query: "khoji",
  respond: "gawah",
  remind: "dakiya",
  help: "sutradhar",
};

export const INTENT_LABEL: Record<Intent, string> = {
  record: "Recording a new debt",
  payment: "Recording a payment",
  query: "A question about scores or dues",
  respond: "Answering a slip someone sent",
  remind: "Chasing a payment",
  help: "General help",
};

export function who(actor: Business) {
  return `${actor.owner} of ${actor.name} (${actor.category}, ${actor.market}, ${actor.city})`;
}

export function contextBlock(world: World, actor: Business) {
  return [
    `The user is ${who(actor)}. Their business_id is "${actor.id}".`,
    `Today is ${weekdayDay(world.today)} (${world.today}). Dates are Indian Standard Time.`,
    `Saakh is a shared ledger for Indian small businesses. A debt ("slip") only counts once both sides confirm it.`,
    `Every business starts with a Saakh score of 100 and loses 1 point for every month a confirmed debt stays unpaid past its due date.`,
  ].join("\n");
}
