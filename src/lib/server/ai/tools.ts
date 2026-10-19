// Data tools the agents can call. They read the projected world; none of
// them write. Writing happens only through commands, after an agent proposes.

import type { SlipView } from "@/lib/shared/types";
import { prettyDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import type { World } from "../project";
import { searchBusinesses } from "../match";
import { appState, lite, profileOf, scoreOf, slipView, slipsFor, statsFor, confirmerOf, raiserOf } from "../views";
import { tool, type ToolSpec } from "./openrouter";
import type { AgentTool } from "./runtime";

export function slipBrief(v: SlipView, perspective?: string) {
  const other = perspective ? (v.creditor.id === perspective ? v.debtor : v.creditor) : null;
  return {
    slip_id: v.id,
    code: v.code,
    lender: v.creditor.name,
    borrower: v.debtor.name,
    ...(other ? { other_party: other.name, direction: v.creditor.id === perspective ? "they owe me" : "I owe them" } : {}),
    amount_inr: v.amount,
    due_date: v.dueDate,
    status: v.phase,
    days_to_due: v.daysToDue,
    days_overdue: v.daysOverdue,
    days_outstanding: v.pendingDays,
    points_lost: v.pointsLost,
    note: v.note,
  };
}

export function findBusinessTool(world: World): AgentTool {
  return {
    spec: tool("find_business", "Fuzzy-search businesses on Saakh by shop name, owner name or city. Spelling mistakes and partial names are fine.", {
      query: { type: "string", description: "Name as the user said it, romanised (e.g. 'sharma ji', 'gupta kirana')." },
    }, ["query"]),
    run: ({ query }) => {
      const hits = searchBusinesses(world, String(query ?? ""), 5);
      return {
        data: hits.map(({ b, score }) => ({ business_id: b.id, name: b.name, owner: b.owner, city: b.city, category: b.category, saakh_score: scoreOf(world, b.id).score, match: +score.toFixed(2) })),
        note: hits.length ? hits.slice(0, 2).map(({ b, score }) => `${b.name} · ${b.city} · ${score.toFixed(2)}`).join("  |  ") : "no match",
      };
    },
    label: ({ query }) => `find_business("${query}")`,
  };
}

export function trustProfileTool(world: World): AgentTool {
  return {
    spec: tool("get_trust_profile", "A business's Saakh score (starts at 100, −1 per month any confirmed debt is late), the points it lost and why, and its payment behaviour.", {
      business_id: { type: "string" },
    }, ["business_id"]),
    run: ({ business_id }) => {
      const p = profileOf(world, String(business_id));
      if (!p) return { data: { error: "Unknown business_id" }, note: "unknown id" };
      const lostBy = new Map<string, { creditor: string; amount: number; points: number; settled: boolean; due: string }>();
      for (const x of p.score.penalties) {
        const k = x.slipId;
        const e = lostBy.get(k) ?? { creditor: x.creditor, amount: x.amount, points: 0, settled: x.settled, due: x.dueDate };
        e.points++;
        lostBy.set(k, e);
      }
      return {
        data: {
          name: p.business.name,
          owner: p.business.owner,
          city: p.business.city,
          category: p.business.category,
          on_saakh_since: p.business.joinedOn,
          saakh_score: p.score.score,
          band: p.score.band,
          points_lost: p.score.pointsLost,
          points_lost_by_debt: [...lostBy.values()],
          owes_now: p.stats.owes,
          is_owed_now: p.stats.owed,
          slips_awaiting_their_confirmation: p.stats.awaitingTheirConfirmation,
          debts_paid: p.stats.closedCount,
          on_time_rate: p.stats.onTimeRate,
          avg_days_late_when_late: p.stats.avgDaysLate,
        },
        note: `score ${p.score.score} · owes ${rupees(p.stats.owes.amount)} (${p.stats.owes.count})`,
      };
    },
  };
}

export function obligationsTool(world: World): AgentTool {
  return {
    spec: tool("list_obligations", "List a business's slips. role=debtor means money THEY owe; role=creditor means money owed TO them. status=pending covers confirmed-but-unpaid (incl. overdue).", {
      business_id: { type: "string" },
      role: { type: "string", enum: ["debtor", "creditor"] },
      status: { type: "string", enum: ["pending", "overdue", "awaiting_confirmation", "paid", "all"] },
    }, ["business_id", "role", "status"]),
    run: ({ business_id, role, status }) => {
      const id = String(business_id);
      if (!world.businesses.has(id)) return { data: { error: "Unknown business_id" }, note: "unknown id" };
      const list = filterSlips(slipsFor(world, id, role === "creditor" ? "creditor" : "debtor"), String(status));
      const total = list.reduce((a, v) => a + v.amount, 0);
      return {
        data: { count: list.length, total_inr: total, slips: list.map((v) => slipBrief(v)) },
        note: `${list.length} ${status} · ${rupees(total)}`,
      };
    },
  };
}

export function filterSlips(list: SlipView[], status: string) {
  const f = list.filter((v) => {
    switch (status) {
      case "pending": return v.status === "confirmed";
      case "overdue": return v.status === "confirmed" && v.daysToDue < 0;
      case "awaiting_confirmation": return v.status === "awaiting";
      case "paid": return v.status === "paid";
      default: return v.status !== "withdrawn";
    }
  });
  return f.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

export function marketTool(world: World): AgentTool {
  return {
    spec: tool("market_overview", "Rank businesses on Saakh. Optionally filter by city or category words.", {
      sort: { type: "string", enum: ["score_asc", "score_desc", "overdue_amount_desc"] },
      city: { type: "string", description: "Optional city filter" },
      category: { type: "string", description: "Optional category filter, e.g. 'packaging'" },
      limit: { type: "number" },
    }, ["sort"]),
    run: (args) => {
      const rows = marketRows(world, args);
      return {
        data: rows.map((r) => ({ business_id: r.id, name: r.name, city: r.city, category: r.category, saakh_score: r.score, overdue_inr: r.overdueAmount, pending_count: r.pending })),
        note: rows.slice(0, 3).map((r) => `${r.name} ${r.score}`).join(" · "),
      };
    },
  };
}

export function marketRows(world: World, args: Record<string, unknown>) {
  const city = String(args.city ?? "").toLowerCase();
  const cat = String(args.category ?? "").toLowerCase();
  const rows = [...world.businesses.values()]
    .filter((b) => (!city || b.city.toLowerCase().includes(city)) && (!cat || b.category.toLowerCase().includes(cat)))
    .map((b) => {
      const st = statsFor(world, b.id);
      return { ...lite(world, b), overdueAmount: st.owes.overdueAmount, pending: st.owes.count };
    });
  const sort = String(args.sort ?? "score_desc");
  rows.sort((a, b) =>
    sort === "score_asc" ? a.score - b.score || b.overdueAmount - a.overdueAmount
      : sort === "overdue_amount_desc" ? b.overdueAmount - a.overdueAmount
        : b.score - a.score || a.name.localeCompare(b.name),
  );
  return rows.slice(0, Math.min(10, Number(args.limit) || 6));
}

export function myPositionTool(world: World, actorId: string): AgentTool {
  return {
    spec: tool("my_position", "The user's own position: their score, what they owe, what they're owed, and what's waiting on them.", {}),
    run: () => {
      const st = appState(world, actorId)!;
      const mine = slipsFor(world, actorId).filter((v) => v.status === "confirmed");
      return {
        data: {
          my_score: st.me.score.score,
          i_owe: { ...st.me.stats.owes, slips: mine.filter((v) => v.debtor.id === actorId).map((v) => slipBrief(v, actorId)) },
          owed_to_me: { ...st.me.stats.owed, slips: mine.filter((v) => v.creditor.id === actorId).map((v) => slipBrief(v, actorId)) },
          slips_i_must_confirm: st.toConfirm.length,
          payments_i_must_acknowledge: st.paymentsToAck.length,
        },
        note: `owe ${rupees(st.me.stats.owes.amount)} · owed ${rupees(st.me.stats.owed.amount)}`,
      };
    },
  };
}

/** Open, confirmed slips between the actor and (optionally) one other business. */
export function openSlipsTool(world: World, actorId: string): AgentTool {
  return {
    spec: tool("list_open_slips", "Confirmed, unpaid slips involving the user, optionally only those with one other business.", {
      with_business_id: { type: "string", description: "Optional — limit to slips with this business" },
    }),
    run: ({ with_business_id }) => {
      const other = with_business_id ? String(with_business_id) : null;
      const list = slipsFor(world, actorId)
        .filter((v) => v.status === "confirmed" && (!other || v.creditor.id === other || v.debtor.id === other))
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
      return { data: list.map((v) => slipBrief(v, actorId)), note: `${list.length} open slip${list.length === 1 ? "" : "s"}` };
    },
  };
}

/** Slips waiting on the actor's confirmation (raised by someone else). */
export function toConfirmTool(world: World, actorId: string): AgentTool {
  return {
    spec: tool("list_slips_to_confirm", "Slips other businesses raised that are waiting for the user to confirm or dispute.", {}),
    run: () => {
      const list = [...world.slips.values()]
        .filter((s) => s.status === "awaiting" && confirmerOf(s) === actorId)
        .map((s) => ({ ...slipBrief(slipView(world, s), actorId), raised_by: world.businesses.get(raiserOf(s))?.name }));
      return { data: list, note: list.length ? list.map((x) => `${x.raised_by} ${rupees(x.amount_inr)}`).join(" · ") : "nothing waiting" };
    },
  };
}

export const describeSlip = (v: SlipView) =>
  `${v.code}: ${v.debtor.name} owes ${v.creditor.name} ${rupees(v.amount)}, due ${prettyDay(v.dueDate)}`;

export type { ToolSpec };
