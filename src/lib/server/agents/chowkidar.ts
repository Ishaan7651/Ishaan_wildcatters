// Chowkidar — the watchman. Walks the ledger once per Saakh day: takes points
// off for late debts, has Dakiya chase what's due or overdue, and files a short
// patrol report. Scores are derived from the facts anyway; the penalty events
// are Chowkidar's signed record of when each point dropped.

import { diffDays, prettyDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { penaltyDropDates } from "@/lib/shared/score";
import { appendEvents, claimPatrolDay, lakeEpoch, readLake, readRuns, today, type EventDraft } from "../store";
import { getWorld, scoreOf, slipView } from "../views";
import { chat, hasKey } from "../ai/openrouter";
import { RunRecorder } from "../ai/runtime";
import { composeReminder } from "./dakiya";

const g = globalThis as unknown as { __saakhPatrolDay?: string };

export interface PatrolOutcome {
  day: string;
  slipsChecked: number;
  overdue: number;
  newPoints: { debtor: string; slip: string; month: number; droppedOn: string; scoreAfter: number }[];
  reminderTargets: string[];
  staleConfirmations: number;
  rec: RunRecorder;
}

export function forgetPatrols() {
  g.__saakhPatrolDay = undefined;
}

/**
 * True for the one caller that should walk today's patrol. Chowkidar walks
 * once per Saakh day, however many instances are serving the app.
 */
export async function claimPatrol() {
  const day = today();
  const key = `${lakeEpoch()}:${day}`;
  if (g.__saakhPatrolDay === key) return false;
  g.__saakhPatrolDay = key;
  if ((await readRuns()).some((r) => r.agent === "chowkidar" && r.simDay === day)) return false;
  return claimPatrolDay(day);
}

/** The deterministic half: assess penalties right now, pick who to remind. */
export async function patrolNow(trigger: string): Promise<PatrolOutcome> {
  const world = getWorld();
  g.__saakhPatrolDay = `${lakeEpoch()}:${world.today}`;
  const rec = new RunRecorder("chowkidar", trigger);
  rec.mode = hasKey() ? "ai" : "offline";

  const assessed = new Set(
    readLake()
      .filter((e) => e.type === "penalty.assessed")
      .map((e) => `${e.data.slipId}:${e.data.month}`),
  );

  const fresh: { debtorId: string; slipId: string; code: string; month: number; droppedOn: string }[] = [];
  let checked = 0;
  let overdue = 0;
  let stale = 0;
  for (const s of world.slips.values()) {
    checked++;
    if (s.status === "awaiting" && diffDays(world.today, s.raisedAt.slice(0, 10)) > 3) stale++;
    if (!(s.status === "confirmed" || s.status === "paid") || !s.confirmedAt) continue;
    const settled = s.status === "paid" && s.payment?.acknowledged ? s.payment.paidOn : null;
    if (!settled && s.dueDate < world.today) overdue++;
    penaltyDropDates(s.dueDate, settled ?? world.today).forEach((day, i) => {
      if (!assessed.has(`${s.id}:${i + 1}`)) fresh.push({ debtorId: s.debtorId, slipId: s.id, code: s.code, month: i + 1, droppedOn: day });
    });
  }
  rec.step("chowkidar", "tool", "scan_ledger", `${checked} slips · ${overdue} overdue`);

  // Running score per debtor, ending at today's derived score.
  fresh.sort((a, b) => (a.droppedOn < b.droppedOn ? -1 : 1));
  const remaining = new Map<string, number>();
  for (const p of fresh) remaining.set(p.debtorId, (remaining.get(p.debtorId) ?? 0) + 1);
  const drafts: EventDraft[] = [];
  const newPoints: PatrolOutcome["newPoints"] = [];
  for (const p of fresh) {
    const left = remaining.get(p.debtorId)! - 1;
    remaining.set(p.debtorId, left);
    const scoreAfter = scoreOf(world, p.debtorId).score + left;
    drafts.push({
      type: "penalty.assessed",
      actor: "agent:chowkidar",
      data: { slipId: p.slipId, debtorId: p.debtorId, month: p.month, droppedOn: p.droppedOn, scoreAfter, agent: "chowkidar" },
    });
    newPoints.push({ debtor: world.businesses.get(p.debtorId)?.name ?? p.debtorId, slip: p.code, month: p.month, droppedOn: p.droppedOn, scoreAfter });
  }
  await appendEvents(drafts);
  newPoints.slice(0, 8).forEach((p) =>
    rec.step("chowkidar", "write", `assess_penalty · ${p.debtor}`, `${p.slip} · month ${p.month} late · score → ${p.scoreAfter}`),
  );
  if (newPoints.length > 8) rec.step("chowkidar", "write", `…and ${newPoints.length - 8} more points`);
  if (!newPoints.length) rec.step("chowkidar", "think", "No new points to take off today");

  // Who needs a reminder: due within 3 days, or overdue and not chased in 14 days.
  const targets: { id: string; weight: number }[] = [];
  for (const s of world.slips.values()) {
    if (s.status !== "confirmed" || (s.payment && !s.payment.acknowledged)) continue;
    const d = diffDays(s.dueDate, world.today);
    const last = s.reminders.length ? s.reminders[s.reminders.length - 1].at.slice(0, 10) : null;
    const since = last ? diffDays(world.today, last) : Infinity;
    if (d >= 0 && d <= 3 && since > 3) targets.push({ id: s.id, weight: s.amount / 10 });
    else if (d < 0 && since >= 14) targets.push({ id: s.id, weight: s.amount * (1 + -d / 30) });
  }
  // Biggest first, and never more than one reminder per borrower per patrol.
  targets.sort((a, b) => b.weight - a.weight);
  const seen = new Set<string>();
  const reminderTargets = targets
    .filter((t) => {
      const debtor = world.slips.get(t.id)!.debtorId;
      if (seen.has(debtor)) return false;
      seen.add(debtor);
      return true;
    })
    .slice(0, 4)
    .map((t) => t.id);
  if (reminderTargets.length) rec.step("chowkidar", "handoff", `Chowkidar → Dakiya`, `${reminderTargets.length} debt${reminderTargets.length === 1 ? "" : "s"} to chase`);

  return { day: world.today, slipsChecked: checked, overdue, newPoints, reminderTargets, staleConfirmations: stale, rec };
}

/** The slower half: reminders and the written report (may call the model). */
export async function patrolFollowUp(o: PatrolOutcome) {
  const world = getWorld();
  const sent: string[] = [];
  const dakiya = new RunRecorder("dakiya", "Patrol hand-off");
  dakiya.mode = o.rec.mode;
  for (const id of o.reminderTargets) {
    const s = world.slips.get(id);
    if (!s) continue;
    const v = slipView(world, s);
    const { message, tone } = await composeReminder(world, v, dakiya);
    await deliverReminderQuiet(id, message, tone);
    dakiya.step("dakiya", "write", `deliver → ${v.debtor.name}`, `${tone} · ${rupees(v.amount)}`);
    sent.push(`${v.debtor.name} (${rupees(v.amount)}, ${tone})`);
  }
  if (sent.length) await dakiya.finish(`Sent ${sent.length} reminder${sent.length === 1 ? "" : "s"} after the patrol: ${sent.join(", ")}.`);

  const facts = [
    `Day: ${prettyDay(o.day)}.`,
    `${o.slipsChecked} slips checked, ${o.overdue} confirmed debts overdue.`,
    o.newPoints.length
      ? `Points taken off today: ${summarisePoints(o.newPoints)}.`
      : "No points taken off today.",
    sent.length ? `Reminders sent: ${sent.join("; ")}.` : "No reminders needed.",
    o.staleConfirmations ? `${o.staleConfirmations} slips have waited over 3 days for confirmation.` : "",
  ].filter(Boolean).join(" ");

  let summary = templateReport(o, sent.length);
  if (hasKey()) {
    try {
      const res = await chat({
        maxTokens: 140,
        temperature: 0.4,
        timeoutMs: 12_000,
        messages: [
          { role: "system", content: "You are Chowkidar, the night-watchman of Saakh, a shared debt ledger for Indian small businesses. Write today's patrol report: 2 short plain sentences, under 40 words in total — what changed, and the one thing worth watching. No markdown, no emojis." },
          { role: "user", content: facts },
        ],
      });
      o.rec.tokens += res.tokens;
      o.rec.model = res.model;
      if (res.message.content?.trim()) summary = res.message.content.trim();
    } catch (e) {
      o.rec.step("chowkidar", "error", "Model failed — filed the standard report", (e as Error).message.slice(0, 120));
    }
  }
  o.rec.step("chowkidar", "say", "write_report", summary.slice(0, 160));
  return o.rec.finish(summary);
}

async function deliverReminderQuiet(slipId: string, message: string, tone: string) {
  // Same event as a user-sent reminder, but logged under the patrol's runs.
  const world = getWorld();
  const s = world.slips.get(slipId);
  if (!s) return;
  await appendEvents([{ type: "reminder.sent", actor: "agent:dakiya", data: { slipId, from: s.creditorId, to: s.debtorId, message, tone, agent: "dakiya" } }]);
}

function summarisePoints(points: PatrolOutcome["newPoints"]) {
  const by = new Map<string, number>();
  for (const p of points) by.set(p.debtor, (by.get(p.debtor) ?? 0) + 1);
  return [...by.entries()].map(([d, n]) => `${d} −${n}`).join(", ");
}

function templateReport(o: PatrolOutcome, reminders: number) {
  const pts = o.newPoints.length ? `${o.newPoints.length} point${o.newPoints.length === 1 ? "" : "s"} taken off (${summarisePoints(o.newPoints)})` : "no new points lost";
  return `Walked ${o.slipsChecked} slips for ${prettyDay(o.day, false)}: ${o.overdue} debts overdue, ${pts}${reminders ? `, ${reminders} reminder${reminders === 1 ? "" : "s"} sent` : ""}.`;
}

export async function fullPatrol(trigger: string) {
  const o = await patrolNow(trigger);
  return patrolFollowUp(o);
}

