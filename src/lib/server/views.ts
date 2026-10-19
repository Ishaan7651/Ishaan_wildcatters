// Read models: everything the UI and the agents look at is derived here from
// the projected world. Scores are never stored — they are recomputed from the
// facts every time, so they can't drift from the ledger.

import type {
  AppState,
  BizLite,
  Business,
  Notice,
  Penalty,
  Phase,
  Profile,
  ProfileStats,
  ScoreSummary,
  SlipView,
} from "@/lib/shared/types";
import { addDays, diffDays, istDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { START_SCORE, bandFor, nextDropDate, penaltyDropDates } from "@/lib/shared/score";
import { project, type SlipState, type World } from "./project";
import { getSimDay, nowISO, readLake } from "./store";
import { aiInfo } from "./ai/openrouter";

export function getWorld(): World {
  return project(readLake(), nowISO());
}

// ---- Scores ----

const scoreMemo = new WeakMap<World, Map<string, ScoreSummary>>();

function isCounted(s: SlipState) {
  return (s.status === "confirmed" || s.status === "paid") && !!s.confirmedAt;
}

function settledOn(s: SlipState): string | null {
  return s.status === "paid" && s.payment?.acknowledged ? s.payment.paidOn : null;
}

export function penaltiesFor(world: World, bizId: string): Penalty[] {
  const out: Penalty[] = [];
  for (const s of world.slips.values()) {
    if (s.debtorId !== bizId || !isCounted(s)) continue;
    const paidOn = settledOn(s);
    const drops = penaltyDropDates(s.dueDate, paidOn ?? world.today);
    drops.forEach((day, i) =>
      out.push({
        slipId: s.id,
        code: s.code,
        creditor: world.businesses.get(s.creditorId)?.name ?? "—",
        amount: s.amount,
        dueDate: s.dueDate,
        month: i + 1,
        droppedOn: day,
        settled: !!paidOn,
      }),
    );
  }
  return out.sort((a, b) => (a.droppedOn < b.droppedOn ? -1 : 1));
}

export function scoreOf(world: World, bizId: string): ScoreSummary {
  let memo = scoreMemo.get(world);
  if (!memo) scoreMemo.set(world, (memo = new Map()));
  const hit = memo.get(bizId);
  if (hit) return hit;
  const penalties = penaltiesFor(world, bizId);
  const score = Math.max(0, START_SCORE - penalties.length);
  const summary = { score, band: bandFor(score), pointsLost: penalties.length, penalties };
  memo.set(bizId, summary);
  return summary;
}

export function lite(world: World, b: Business | undefined): BizLite {
  if (!b) return { id: "?", name: "Unknown", owner: "", city: "", category: "", score: START_SCORE, band: "excellent" };
  const s = scoreOf(world, b.id);
  return { id: b.id, name: b.name, owner: b.owner, city: b.city, category: b.category, score: s.score, band: s.band };
}

// ---- Slips ----

export function phaseOf(s: SlipState, today: string): Phase {
  switch (s.status) {
    case "awaiting":
    case "disputed":
    case "countered":
    case "withdrawn":
      return s.status;
    case "paid":
      return s.payment && s.payment.paidOn > s.dueDate ? "paid_late" : "paid_on_time";
    case "confirmed": {
      if (s.payment && !s.payment.acknowledged) return "payment_claimed";
      const d = diffDays(s.dueDate, today);
      if (d < 0) return "overdue";
      if (d === 0) return "due_today";
      if (d <= 3) return "due_soon";
      return "upcoming";
    }
  }
}

export function slipView(world: World, s: SlipState): SlipView {
  const today = world.today;
  const phase = phaseOf(s, today);
  const paidOn = settledOn(s);
  const end = paidOn ?? today;
  const counted = isCounted(s);
  const pointsLost = counted ? penaltyDropDates(s.dueDate, end).length : 0;
  const open = s.status === "confirmed";
  return {
    id: s.id,
    code: s.code,
    creditor: lite(world, world.businesses.get(s.creditorId)),
    debtor: lite(world, world.businesses.get(s.debtorId)),
    amount: s.amount,
    originalAmount: s.originalAmount,
    dueDate: s.dueDate,
    note: s.note,
    raisedBy: s.raisedBy,
    raisedAt: s.raisedAt,
    source: s.source,
    utterance: s.utterance,
    status: s.status,
    phase,
    confirmedAt: s.confirmedAt,
    dispute: s.dispute ? { reason: s.dispute.reason, at: s.dispute.at, counterAmount: s.dispute.counterAmount } : undefined,
    payment: s.payment,
    daysToDue: diffDays(s.dueDate, today),
    daysOverdue: open ? Math.max(0, diffDays(today, s.dueDate)) : paidOn ? Math.max(0, diffDays(paidOn, s.dueDate)) : 0,
    pendingDays: Math.max(0, diffDays(today, istDay(s.raisedAt))),
    pointsLost,
    nextPointOn: open ? nextDropDate(s.dueDate, today) : undefined,
    reminders: s.reminders,
    timeline: s.timeline,
  };
}

export function slipById(world: World, id: string): SlipView | null {
  const s = world.slips.get(id) ?? [...world.slips.values()].find((x) => x.code === id);
  return s ? slipView(world, s) : null;
}

/** Who has to act on a slip that's waiting for confirmation. */
export function confirmerOf(s: SlipState) {
  return s.raisedBy === "creditor" ? s.debtorId : s.creditorId;
}

export function raiserOf(s: SlipState) {
  return s.raisedBy === "creditor" ? s.creditorId : s.debtorId;
}

const byDue = (a: SlipView, b: SlipView) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0);
const byRecent = (a: SlipView, b: SlipView) => (a.raisedAt > b.raisedAt ? -1 : 1);

export function slipsFor(world: World, bizId: string, role: "debtor" | "creditor" | "both" = "both"): SlipView[] {
  const out: SlipView[] = [];
  for (const s of world.slips.values()) {
    const mine =
      role === "both" ? s.debtorId === bizId || s.creditorId === bizId : role === "debtor" ? s.debtorId === bizId : s.creditorId === bizId;
    if (mine) out.push(slipView(world, s));
  }
  return out;
}

// ---- Profiles ----

export function statsFor(world: World, bizId: string): ProfileStats {
  const stats: ProfileStats = {
    owes: { count: 0, amount: 0, overdueCount: 0, overdueAmount: 0, oldestOverdueDays: 0 },
    owed: { count: 0, amount: 0, overdueCount: 0, overdueAmount: 0 },
    awaitingTheirConfirmation: 0,
    closedCount: 0,
    onTimeRate: null,
    avgDaysLate: null,
    lifetimeVolume: 0,
  };
  let onTime = 0;
  let lateDays = 0;
  let lateCount = 0;
  for (const s of world.slips.values()) {
    const isDebtor = s.debtorId === bizId;
    const isCreditor = s.creditorId === bizId;
    if (!isDebtor && !isCreditor) continue;
    if (s.status === "awaiting" && confirmerOf(s) === bizId) stats.awaitingTheirConfirmation++;
    if (s.status === "confirmed" || s.status === "paid") stats.lifetimeVolume += s.amount;
    if (s.status === "confirmed") {
      const overdue = diffDays(world.today, s.dueDate);
      const bucket = isDebtor ? stats.owes : stats.owed;
      bucket.count++;
      bucket.amount += s.amount;
      if (overdue > 0) {
        bucket.overdueCount++;
        bucket.overdueAmount += s.amount;
        if (isDebtor) stats.owes.oldestOverdueDays = Math.max(stats.owes.oldestOverdueDays, overdue);
      }
    }
    if (s.status === "paid" && isDebtor && s.payment) {
      stats.closedCount++;
      const late = diffDays(s.payment.paidOn, s.dueDate);
      if (late <= 0) onTime++;
      else {
        lateDays += late;
        lateCount++;
      }
    }
  }
  if (stats.closedCount) stats.onTimeRate = onTime / stats.closedCount;
  if (lateCount) stats.avgDaysLate = Math.round(lateDays / lateCount);
  return stats;
}

export function historyFor(world: World, bizId: string): { day: string; score: number }[] {
  const b = world.businesses.get(bizId);
  const penalties = penaltiesFor(world, bizId);
  const start = penalties.length && penalties[0].droppedOn < (b?.joinedOn ?? world.today)
    ? addDays(penalties[0].droppedOn, -14)
    : b?.joinedOn ?? world.today;
  const points: { day: string; score: number }[] = [{ day: start, score: START_SCORE }];
  let score = START_SCORE;
  for (const p of penalties) {
    score = Math.max(0, score - 1);
    const last = points[points.length - 1];
    if (last.day === p.droppedOn) last.score = score;
    else points.push({ day: p.droppedOn, score });
  }
  if (points[points.length - 1].day !== world.today) points.push({ day: world.today, score });
  return points;
}

export function profileOf(world: World, bizId: string): Profile | null {
  const business = world.businesses.get(bizId);
  if (!business) return null;
  const all = slipsFor(world, bizId);
  const openish = (v: SlipView) => v.status === "confirmed" || v.status === "awaiting" || v.status === "countered" || v.status === "disputed";
  return {
    business,
    score: scoreOf(world, bizId),
    stats: statsFor(world, bizId),
    history: historyFor(world, bizId),
    owes: all.filter((v) => v.debtor.id === bizId && openish(v)).sort(byDue),
    owed: all.filter((v) => v.creditor.id === bizId && openish(v)).sort(byDue),
    closed: all.filter((v) => !openish(v)).sort(byRecent).slice(0, 30),
  };
}

export function allBusinesses(world: World) {
  return [...world.businesses.values()].map((b) => {
    const st = statsFor(world, b.id);
    return { ...lite(world, b), market: b.market, invited: !!b.invitedBy, owes: st.owes, owed: st.owed };
  });
}

// ---- The actor's home screen ----

export function appState(world: World, actorId: string): AppState | null {
  const me = world.businesses.get(actorId);
  if (!me) return null;
  const toConfirm: SlipView[] = [];
  const paymentsToAck: SlipView[] = [];
  const countersToReview: SlipView[] = [];
  const waitingOnOthers: SlipView[] = [];
  const dueSoon: SlipView[] = [];
  const overdueToMe: SlipView[] = [];

  for (const s of world.slips.values()) {
    if (s.creditorId !== actorId && s.debtorId !== actorId) continue;
    const v = slipView(world, s);
    if (s.status === "awaiting") (confirmerOf(s) === actorId ? toConfirm : waitingOnOthers).push(v);
    if ((s.status === "countered" || s.status === "disputed") && raiserOf(s) === actorId) countersToReview.push(v);
    if (s.status === "confirmed" && s.payment && !s.payment.acknowledged && s.creditorId === actorId) paymentsToAck.push(v);
    const unpaid = s.status === "confirmed" && v.phase !== "payment_claimed";
    if (unpaid && s.debtorId === actorId && v.daysToDue <= 7) dueSoon.push(v);
    if (unpaid && s.creditorId === actorId && v.daysToDue < 0) overdueToMe.push(v);
  }

  const sim = getSimDay();
  return {
    clock: { today: world.today, realToday: istDay(), simulated: !!sim && sim !== istDay(), nowISO: world.asOf },
    ai: aiInfo(),
    me: { business: me, score: scoreOf(world, actorId), stats: statsFor(world, actorId) },
    toConfirm: toConfirm.sort(byRecent),
    paymentsToAck: paymentsToAck.sort(byRecent),
    countersToReview: countersToReview.sort(byRecent),
    waitingOnOthers: waitingOnOthers.sort(byRecent),
    dueSoon: dueSoon.sort(byDue),
    overdueToMe: overdueToMe.sort(byDue),
    notices: noticesFor(world, actorId),
  };
}

export function noticesFor(world: World, actorId: string): Notice[] {
  const out: Notice[] = [];
  const nm = (id: string) => world.businesses.get(id)?.name ?? "Someone";
  for (const e of world.events) {
    const d = e.data as Record<string, unknown>;
    const s = typeof d.slipId === "string" ? world.slips.get(d.slipId) : undefined;
    if (!s) continue;
    const amt = rupees(s.amount);
    const base = { id: e.id, at: e.at, slipId: s.id };
    switch (e.type) {
      case "confirmation.requested":
        if (d.to === actorId)
          out.push({ ...base, kind: "confirm_request", agent: "gawah", title: `${nm(raiserOf(s))} needs your confirmation`, body: d.message as string });
        break;
      case "slip.confirmed":
        if (raiserOf(s) === actorId && d.by !== actorId)
          out.push({ ...base, kind: "confirmed", agent: "gawah", title: `${nm(d.by as string)} confirmed ${amt}`, body: `Slip ${s.code} is now on record for both of you.` });
        break;
      case "slip.disputed":
        if (raiserOf(s) === actorId)
          out.push({
            ...base,
            kind: d.counterAmount ? "countered" : "disputed",
            agent: "gawah",
            title: d.counterAmount ? `${nm(d.by as string)} proposed ${rupees(d.counterAmount as number)}` : `${nm(d.by as string)} disputed ${amt}`,
            body: (d.reason as string) || "No reason given.",
          });
        break;
      case "reminder.sent":
        if (d.to === actorId)
          out.push({ ...base, kind: "reminder", agent: "dakiya", title: `Reminder from ${nm(s.creditorId)}`, body: d.message as string });
        break;
      case "penalty.assessed":
        if (s.debtorId === actorId)
          out.push({
            ...base,
            kind: "penalty",
            agent: "chowkidar",
            title: `−1 point · ${amt} to ${nm(s.creditorId)}`,
            body: `Month ${d.month} past the due date. Your score is now ${d.scoreAfter}.`,
          });
        break;
      case "payment.recorded":
        if (d.role === "debtor" && s.creditorId === actorId)
          out.push({ ...base, kind: "payment_claimed", agent: "gawah", title: `${nm(s.debtorId)} says they paid ${amt}`, body: `Confirm once the money reaches you.` });
        break;
      case "payment.acknowledged":
        if (s.debtorId === actorId)
          out.push({ ...base, kind: "payment_ack", agent: "gawah", title: `${nm(s.creditorId)} confirmed your payment`, body: `Slip ${s.code} is closed.` });
        break;
      case "slip.withdrawn":
        if (confirmerOf(s) === actorId)
          out.push({ ...base, kind: "withdrawn", title: `${nm(d.by as string)} withdrew slip ${s.code}`, body: `It no longer needs your confirmation.` });
        break;
    }
  }
  return out.sort((a, b) => (a.at > b.at ? -1 : 1)).slice(0, 40);
}

// ---- Network ----

export function network(world: World) {
  const nodes = allBusinesses(world).map((b) => {
    const biz = world.businesses.get(b.id)!;
    return { ...b, lat: biz.lat, lng: biz.lng };
  });
  const links = new Map<string, { source: string; target: string; open: number; overdue: number; count: number; settled: number; awaiting: number }>();
  for (const s of world.slips.values()) {
    if (s.status === "withdrawn") continue;
    const key = `${s.debtorId}>${s.creditorId}`;
    const l = links.get(key) ?? { source: s.debtorId, target: s.creditorId, open: 0, overdue: 0, count: 0, settled: 0, awaiting: 0 };
    l.count++;
    if (s.status === "paid") l.settled += s.amount;
    if (s.status === "awaiting") l.awaiting += s.amount;
    if (s.status === "confirmed") {
      l.open += s.amount;
      if (diffDays(world.today, s.dueDate) > 0) l.overdue += s.amount;
    }
    links.set(key, l);
  }
  return { nodes, links: [...links.values()], today: world.today };
}
