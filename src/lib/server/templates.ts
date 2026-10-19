// Plain-language message templates. The agents write their own wording when
// the AI is available; these are the fallbacks (and the seed data's voice).

import { prettyDay, diffDays } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";

export function confirmationMessage(o: { raiser: string; amount: number; dueDate: string; note?: string; raisedBy: "creditor" | "debtor" }) {
  const what = o.note ? ` for ${o.note}` : "";
  return o.raisedBy === "creditor"
    ? `${o.raiser} says you owe them ${rupees(o.amount)}${what}, due ${prettyDay(o.dueDate, false)}. If that's right, confirm it — it only counts once you agree.`
    : `${o.raiser} has recorded that they owe you ${rupees(o.amount)}${what}, due ${prettyDay(o.dueDate, false)}. Confirm so it's on record for both of you.`;
}

export type Tone = "gentle" | "firm" | "serious";

export function toneFor(daysToDue: number): Tone {
  if (daysToDue >= 0) return "gentle";
  if (daysToDue > -30) return "firm";
  return "serious";
}

export function reminderMessage(o: {
  creditor: string;
  debtorOwner: string;
  amount: number;
  dueDate: string;
  today: string;
  note?: string;
  score?: number;
}) {
  const first = o.debtorOwner.split(" ")[0];
  const d = diffDays(o.dueDate, o.today);
  const what = o.note ? ` (${o.note})` : "";
  if (d > 0)
    return `Namaste ${first} ji, a gentle reminder from ${o.creditor}: ${rupees(o.amount)}${what} is due on ${prettyDay(o.dueDate, false)} — ${d} day${d === 1 ? "" : "s"} from now. Paying on time keeps your Saakh score at ${o.score ?? 100}.`;
  if (d === 0)
    return `Namaste ${first} ji, ${rupees(o.amount)}${what} for ${o.creditor} is due today. Pay by tonight and your Saakh score stays untouched.`;
  const late = -d;
  if (late < 30)
    return `${first} ji, ${rupees(o.amount)}${what} owed to ${o.creditor} was due on ${prettyDay(o.dueDate, false)} — ${late} days ago. One point has already come off your Saakh score; another goes each month it stays unpaid. Please clear it this week.`;
  const months = Math.floor(late / 30) + 1;
  return `${first} ji, this is now serious: ${rupees(o.amount)}${what} owed to ${o.creditor} is ${late} days overdue and has cost you ${months} Saakh points so far. Every buyer checking your score can see it. Please pay or call ${o.creditor} today.`;
}
