// Sutradhar — the router. Reads whatever the user said and hands it to the
// agent whose job it is.

import type { Business, Intent } from "@/lib/shared/types";
import { AGENTS } from "@/lib/shared/agents";
import type { World } from "../project";
import { chat, hasKey, ROUTER_MODEL, tool } from "../ai/openrouter";
import { routeOffline } from "../ai/offline";
import type { RunRecorder } from "../ai/runtime";
import { AGENT_FOR, INTENT_LABEL, contextBlock } from "./context";

const ROUTE = tool("route_request", "Send the request to the right agent.", {
  intent: {
    type: "string",
    enum: ["record", "payment", "query", "respond", "remind", "help"],
    description: [
      "record — the user states a NEW debt: someone owes them, or they owe someone (owes me, udhaar, baaki, lena hai, dena hai, sold on credit).",
      "payment — money was paid or received against an existing debt (paid, received, mil gaya, de diya).",
      "query — a question: someone's score, pending payments, how long, who owes what, rankings, their own position.",
      "respond — confirming or denying a debt someone else recorded against them (yes I owe…, haan sahi hai, no that's wrong, it was only 1,500).",
      "remind — wants to remind or chase someone to pay.",
      "help — greetings, how does this work, or anything else.",
    ].join("\n"),
  },
  reason: { type: "string", description: "Under 10 words." },
}, ["intent", "reason"]);

export async function route(rec: RunRecorder, world: World, actor: Business, utterance: string): Promise<Intent> {
  const done = (intent: Intent, detail: string) => {
    rec.step("sutradhar", "route", `Sutradhar → ${AGENTS[AGENT_FOR[intent]].title}`, detail);
    return intent;
  };

  if (!hasKey()) {
    rec.mode = "offline";
    return done(routeOffline(utterance), `${INTENT_LABEL[routeOffline(utterance)]} · rules`);
  }
  try {
    const res = await chat({
      model: ROUTER_MODEL,
      maxTokens: 120,
      temperature: 0,
      tools: [ROUTE],
      toolChoice: { type: "function", function: { name: "route_request" } },
      messages: [
        {
          role: "system",
          content: `You are Sutradhar, the router inside Saakh.\n${contextBlock(world, actor)}\nThe user may speak English, Hindi or Hinglish; voice transcripts can be messy. Pick the single best intent.`,
        },
        { role: "user", content: utterance },
      ],
    });
    rec.tokens += res.tokens;
    rec.model = res.model;
    const args = JSON.parse(res.message.tool_calls?.[0]?.function.arguments ?? "{}") as { intent?: Intent; reason?: string };
    const intent = args.intent && args.intent in AGENT_FOR ? args.intent : routeOffline(utterance);
    return done(intent, args.reason || INTENT_LABEL[intent]);
  } catch (e) {
    rec.step("sutradhar", "error", "Model unreachable — routed by rules", (e as Error).message.slice(0, 160));
    rec.mode = "offline";
    return done(routeOffline(utterance), INTENT_LABEL[routeOffline(utterance)]);
  }
}
