// Khoji — the inquirer. Answers questions about scores and dues by looking
// things up with tools, then speaks a short answer and picks the cards to show.
// The cards are filled from the ledger, never from the model's words.

import type { AnswerCard, BoloResult, Business } from "@/lib/shared/types";
import { spanLabel } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { BAND_META } from "@/lib/shared/score";
import type { World } from "../project";
import { findMentioned } from "../match";
import { appState, lite, profileOf, slipsFor } from "../views";
import { hasKey, tool } from "../ai/openrouter";
import { runAgent, type RunRecorder } from "../ai/runtime";
import { filterSlips, findBusinessTool, marketRows, marketTool, myPositionTool, obligationsTool, trustProfileTool } from "../ai/tools";
import { contextBlock } from "./context";

const ANSWER = tool("answer", "Give the final answer: a short spoken reply plus the cards to show.", {
  speech: {
    type: "string",
    description: "What to say aloud. Under 70 words, plain sentences, no markdown or lists. Use ₹ with Indian grouping. Lead with the score, then how many payments are pending, the total, and how long the oldest has waited. Reply in the user's language (English, Hindi or Hinglish in Latin script).",
  },
  cards: {
    type: "array",
    description: "Cards to show under the answer, most important first (max 3).",
    items: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["profile", "obligations", "leaderboard", "position"] },
        business_id: { type: "string", description: "profile / obligations" },
        role: { type: "string", enum: ["debtor", "creditor"], description: "obligations: debtor = what they owe" },
        status: { type: "string", enum: ["pending", "overdue", "awaiting_confirmation", "paid", "all"] },
        sort: { type: "string", enum: ["score_asc", "score_desc", "overdue_amount_desc"], description: "leaderboard" },
        city: { type: "string" },
        category: { type: "string" },
      },
      required: ["kind"],
    },
  },
  follow_ups: { type: "array", items: { type: "string" }, description: "2 short follow-up questions the user might ask next." },
}, ["speech", "cards", "follow_ups"]);

type CardReq = { kind: string; business_id?: string; role?: string; status?: string; sort?: string; city?: string; category?: string };

export async function answer(rec: RunRecorder, world: World, actor: Business, utterance: string): Promise<BoloResult> {
  if (hasKey() && rec.mode === "ai") {
    try {
      const out = await runAgent({
        rec,
        agent: "khoji",
        system: `You are the Detective inside Saakh. You answer questions about businesses' Saakh scores and their pending payments by calling tools — never guess numbers.\n${contextBlock(world, actor)}\nFor a question about a business: find_business, then get_trust_profile, then list_obligations (role=debtor, status=pending) so you can say how many payments they owe and how long each has been outstanding. "Loans/payments pending" means money that business owes. "Me/my/mera" means the user (use my_position). Call several tools in one turn when you can.`,
        user: utterance,
        tools: [findBusinessTool(world), trustProfileTool(world), obligationsTool(world), marketTool(world), myPositionTool(world, actor.id)],
        final: ANSWER,
        maxTurns: 5,
        maxTokens: 1100,
      });
      const cards = hydrate(world, actor, (Array.isArray(out.cards) ? out.cards : []) as CardReq[]);
      rec.step("khoji", "say", "answer", `${cards.length} card${cards.length === 1 ? "" : "s"}`);
      return {
        kind: "answer",
        speech: String(out.speech ?? ""),
        cards,
        followUps: Array.isArray(out.follow_ups) ? out.follow_ups.map(String).slice(0, 3) : [],
      };
    } catch (e) {
      rec.step("khoji", "error", "Model failed — answered from the ledger by rules", (e as Error).message.slice(0, 160));
      rec.mode = "offline";
    }
  }
  return offlineAnswer(rec, world, actor, utterance);
}

function hydrate(world: World, actor: Business, reqs: CardReq[]): AnswerCard[] {
  const cards: AnswerCard[] = [];
  for (const r of reqs.slice(0, 3)) {
    if (r.kind === "profile" && r.business_id) {
      const p = profileOf(world, r.business_id);
      if (p) cards.push({ kind: "profile", profile: p });
    } else if (r.kind === "obligations" && r.business_id && world.businesses.has(r.business_id)) {
      const role = r.role === "creditor" ? "creditor" : "debtor";
      const status = r.status ?? "pending";
      const b = world.businesses.get(r.business_id)!;
      const slips = filterSlips(slipsFor(world, b.id, role), status);
      cards.push({
        kind: "obligations",
        title: `${role === "debtor" ? `What ${b.name} owes` : `What's owed to ${b.name}`} · ${status.replace("_", " ")}`,
        business: lite(world, b),
        role,
        slips,
      });
    } else if (r.kind === "leaderboard") {
      const rows = marketRows(world, r);
      cards.push({ kind: "leaderboard", title: leaderboardTitle(r), rows });
    } else if (r.kind === "position") {
      cards.push(positionCard(world, actor));
    }
  }
  return dedupe(cards);
}

function dedupe(cards: AnswerCard[]) {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const k = c.kind === "profile" ? `p:${c.profile.business.id}` : c.kind === "obligations" ? `o:${c.business.id}:${c.role}` : c.kind;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function leaderboardTitle(r: CardReq) {
  const where = [r.category, r.city].filter(Boolean).join(" · ");
  const what = r.sort === "score_asc" ? "Lowest scores" : r.sort === "overdue_amount_desc" ? "Most money overdue" : "Highest scores";
  return where ? `${what} · ${where}` : what;
}

function positionCard(world: World, actor: Business): AnswerCard {
  const st = appState(world, actor.id)!;
  const mine = slipsFor(world, actor.id).filter((v) => v.status === "confirmed").sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  return { kind: "position", me: st.me, owes: mine.filter((v) => v.debtor.id === actor.id), owed: mine.filter((v) => v.creditor.id === actor.id) };
}

const possessive = (n: string) => (/s$/i.test(n) ? `${n}'` : `${n}'s`);

function offlineAnswer(rec: RunRecorder, world: World, actor: Business, utterance: string): BoloResult {
  const t = utterance.toLowerCase();
  if (/\b(worst|lowest|risk|riskiest|rank|top|best|highest|leaderboard|market)\b/.test(t)) {
    const sort = /\b(best|highest|top)\b/.test(t) && !/worst|risk/.test(t) ? "score_desc" : "score_asc";
    const rows = marketRows(world, { sort, limit: 6 });
    rec.step("khoji", "tool", `market_overview(${sort})`, rows.slice(0, 3).map((r) => `${r.name} ${r.score}`).join(" · "));
    const lead = rows[0];
    return {
      kind: "answer",
      speech: sort === "score_asc"
        ? `The lowest score on Saakh right now is ${lead.name} at ${lead.score}, with ${rupees(lead.overdueAmount)} overdue.`
        : `${lead.name} leads with a score of ${lead.score}.`,
      cards: [{ kind: "leaderboard", title: sort === "score_asc" ? "Lowest scores" : "Highest scores", rows }],
      followUps: [`Check the score for ${lead.name}`, "How much do I owe?"],
    };
  }

  const hit = findMentioned(world, utterance, actor.id);
  const aboutMe = !hit && /\b(my|me|mera|mere|mujhe|i owe|owed to me|mine)\b/.test(t);
  if (aboutMe || (!hit && /\bi\b/.test(t))) {
    rec.step("khoji", "tool", "my_position()", "your score, dues and receivables");
    const card = positionCard(world, actor) as Extract<AnswerCard, { kind: "position" }>;
    const s = card.me;
    return {
      kind: "answer",
      speech: `Your Saakh score is ${s.score.score}. You owe ${rupees(s.stats.owes.amount)} across ${s.stats.owes.count} slip${s.stats.owes.count === 1 ? "" : "s"}, and you're owed ${rupees(s.stats.owed.amount)} across ${s.stats.owed.count}${s.stats.owed.overdueCount ? `, ${s.stats.owed.overdueCount} of them overdue` : ""}.`,
      cards: [card],
      followUps: ["Who owes me the most?", "Which of my payments are due this week?"],
    };
  }

  if (!hit) {
    rec.step("khoji", "think", "Couldn't tell which business you meant");
    return {
      kind: "message",
      text: "Which business should I look up? Say its name, like “Check the score for Sharma Traders”.",
      suggestions: ["Check the score for Sharma Traders", "Who has the lowest score?", "How much do I owe?"],
    };
  }

  rec.step("khoji", "tool", `find_business("${hit.b.name}")`, `${hit.b.name} · ${hit.b.city} · ${hit.score.toFixed(2)}`);
  const p = profileOf(world, hit.b.id)!;
  rec.step("khoji", "tool", `get_trust_profile(${hit.b.id})`, `score ${p.score.score}`);
  const pending = filterSlips(slipsFor(world, hit.b.id, "debtor"), "pending");
  rec.step("khoji", "tool", `list_obligations(${hit.b.id}, debtor, pending)`, `${pending.length} pending`);
  const overdue = pending.filter((v) => v.daysToDue < 0);
  const oldest = [...pending].sort((a, b) => b.pendingDays - a.pendingDays)[0];
  const total = pending.reduce((a, v) => a + v.amount, 0);
  const speech = [
    `${possessive(p.business.name)} Saakh score is ${p.score.score} — ${BAND_META[p.score.band].label.toLowerCase()}${p.score.pointsLost ? `, with ${p.score.pointsLost} point${p.score.pointsLost === 1 ? "" : "s"} lost to late payments` : ", never late"}.`,
    pending.length
      ? `They have ${pending.length} payment${pending.length === 1 ? "" : "s"} pending worth ${rupees(total)}${overdue.length ? `, ${overdue.length} overdue` : ", none overdue"}. The oldest has been outstanding ${spanLabel(oldest.pendingDays)}${oldest.daysOverdue ? `, ${oldest.daysOverdue} days past due` : ""}.`
      : "They have no payments pending right now.",
  ].join(" ");
  return {
    kind: "answer",
    speech,
    cards: [
      { kind: "profile", profile: p },
      ...(pending.length ? [{ kind: "obligations" as const, title: `What ${p.business.name} owes · pending`, business: lite(world, p.business), role: "debtor" as const, slips: pending }] : []),
    ],
    followUps: [`Who does ${p.business.name} owe the most?`, "Who has the lowest score?"],
  };
}
