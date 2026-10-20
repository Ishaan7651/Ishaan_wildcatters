// Dakiya — the postman. Writes reminders that get firmer as a debt ages, and
// delivers them to the borrower's inbox.

import type { BoloResult, Business, SlipView } from "@/lib/shared/types";
import { rupees } from "@/lib/shared/money";
import type { World } from "../project";
import { findMentioned } from "../match";
import { getWorld, scoreOf, slipById, slipsFor } from "../views";
import { appendEvents } from "../store";
import { CommandError } from "../commands";
import { chat, hasKey } from "../ai/openrouter";
import { RunRecorder } from "../ai/runtime";
import { reminderMessage, toneFor, type Tone } from "../templates";

export async function composeReminder(world: World, v: SlipView, rec?: RunRecorder): Promise<{ message: string; tone: Tone }> {
  const tone = toneFor(v.daysToDue);
  const debtor = world.businesses.get(v.debtor.id)!;
  const fallback = reminderMessage({
    creditor: v.creditor.name,
    debtorOwner: debtor.owner,
    amount: v.amount,
    dueDate: v.dueDate,
    today: world.today,
    note: v.note,
    score: scoreOf(world, v.debtor.id).score,
  });
  if (!hasKey() || rec?.mode === "offline") return { message: fallback, tone };
  try {
    const res = await chat({
      maxTokens: 180,
      temperature: 0.6,
      timeoutMs: 12_000,
      messages: [
        {
          role: "system",
          content: `You are Dakiya, who writes payment reminders inside Saakh, a shared debt ledger for Indian small businesses. Write one WhatsApp-style reminder from the lender to the borrower. Max 3 short sentences. Address the borrower by first name + "ji". Tone: ${tone} (gentle = friendly nudge before the due date; firm = clear, polite, overdue; serious = direct, mentions that buyers checking their Saakh score can see it). Mention the exact amount (₹, Indian grouping), what it's for if known, and how the Saakh score is affected (1 point lost per month late). A natural touch of Hinglish is welcome. No emojis, no markdown, no sign-off line.`,
        },
        {
          role: "user",
          content: `Lender: ${v.creditor.name}. Borrower: ${debtor.owner} of ${debtor.name}. Amount: ₹${v.amount.toLocaleString("en-IN")}${v.note ? ` for ${v.note}` : ""}. Due: ${v.dueDate}. Today: ${world.today}. ${v.daysToDue >= 0 ? `Due in ${v.daysToDue} days.` : `${-v.daysToDue} days overdue, ${v.pointsLost} point(s) already lost; current score ${scoreOf(world, v.debtor.id).score}.`}`,
        },
      ],
    });
    if (rec) {
      rec.tokens += res.tokens;
      rec.model = res.model;
    }
    const text = res.message.content?.trim();
    return { message: text || fallback, tone };
  } catch (e) {
    rec?.step("dakiya", "error", "Model failed — used the standard wording", (e as Error).message.slice(0, 120));
    return { message: fallback, tone };
  }
}

/** "Remind Sharma about his dues" → a ready-to-send reminder. */
export async function draftFromRequest(rec: RunRecorder, world: World, actor: Business, utterance: string): Promise<BoloResult> {
  const hit = findMentioned(world, utterance, actor.id);
  rec.step("dakiya", "tool", "find_business (in sentence)", hit ? hit.b.name : "no business named");
  const open = slipsFor(world, actor.id, "creditor")
    .filter((v) => v.status === "confirmed" && (!hit || v.debtor.id === hit.b.id))
    .sort((a, b) => a.daysToDue - b.daysToDue);
  rec.step("dakiya", "tool", "list_open_slips", `${open.length} open slip${open.length === 1 ? "" : "s"} owed to you`);
  const slip = open[0];
  if (!slip) {
    return {
      kind: "message",
      text: hit ? `${hit.b.name} doesn't owe you anything on Saakh right now.` : "Who should I remind? Say the business name.",
      suggestions: ["Who owes me money?", "Remind Sharma Traders"],
    };
  }
  const { message, tone } = await composeReminder(world, slip, rec);
  rec.step("dakiya", "write", "draft_reminder", `${tone} · ${slip.debtor.name} · ${rupees(slip.amount)}`);
  return { kind: "reminder_draft", slip, message, tone };
}

export async function deliverReminder(actorId: string, slipId: string, message: string, tone: string, trigger = "Sent by you") {
  const world = getWorld();
  const v = slipById(world, slipId);
  if (!v) throw new CommandError("That slip doesn't exist.", 404);
  if (v.creditor.id !== actorId && !actorId.startsWith("agent:")) throw new CommandError("Only the lender can send a reminder.", 403);
  if (v.status !== "confirmed") throw new CommandError("Reminders are for confirmed, unpaid slips.", 409);
  await appendEvents([{ type: "reminder.sent", actor: "agent:dakiya", data: { slipId, from: v.creditor.id, to: v.debtor.id, message: message.slice(0, 600), tone, agent: "dakiya" } }]);
  const rec = new RunRecorder("dakiya", trigger, v.creditor.id);
  rec.mode = hasKey() ? "ai" : "offline";
  rec.step("dakiya", "write", `deliver → ${v.debtor.name}`, message.slice(0, 120));
  await rec.finish(`Sent a ${tone} reminder to ${v.debtor.name} for ${rupees(v.amount)}.`);
}
