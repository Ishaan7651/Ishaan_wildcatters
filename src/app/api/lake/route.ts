import { readLake, nowISO, type LakeEvent } from "@/lib/server/store";
import { getWorld } from "@/lib/server/views";
import { rupees } from "@/lib/shared/money";
import { prettyDay } from "@/lib/shared/dates";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(200, Number(url.searchParams.get("limit")) || 60);
    const type = url.searchParams.get("type");
    const before = Number(url.searchParams.get("before")) || Infinity;
    const all = readLake();
    const now = nowISO();
    const world = getWorld();
    const visible = all.filter((e) => e.at <= now);
    const counts: Record<string, number> = {};
    for (const e of visible) counts[e.type] = (counts[e.type] ?? 0) + 1;
    const rows = visible
      .filter((e) => (!type || e.type === type) && e.seq < before)
      .sort((a, b) => b.seq - a.seq)
      .slice(0, limit)
      .map((e) => ({ ...e, summary: describe(e, world.businesses) }));
    return Response.json({
      events: rows,
      total: visible.length,
      future: all.length - visible.length,
      counts,
      head: all[all.length - 1]?.hash ?? null,
      bytes: Buffer.byteLength(all.map((e) => JSON.stringify(e)).join("\n")),
    });
  } catch (e) {
    return fail(e);
  }
}

function describe(e: LakeEvent, biz: Map<string, { name: string }>): string {
  const d = e.data as Record<string, unknown>;
  const n = (id: unknown) => biz.get(String(id))?.name ?? String(id);
  switch (e.type) {
    case "business.registered":
      return `${d.name} joined (${d.category}, ${d.city})`;
    case "slip.raised":
      return `${d.code}: ${n(d.debtorId)} owes ${n(d.creditorId)} ${rupees(d.amount as number)}, due ${prettyDay(d.dueDate as string)}`;
    case "confirmation.requested":
      return `Gawah asked ${n(d.to)} to confirm`;
    case "slip.confirmed":
      return `${n(d.by)} confirmed`;
    case "slip.disputed":
      return d.counterAmount ? `${n(d.by)} countered with ${rupees(d.counterAmount as number)}` : `${n(d.by)} disputed`;
    case "slip.counter_accepted":
      return `${n(d.by)} accepted ${rupees(d.amount as number)}`;
    case "slip.withdrawn":
      return `${n(d.by)} withdrew the slip`;
    case "payment.recorded":
      return `${n(d.by)} recorded payment of ${rupees(d.amount as number)} on ${prettyDay(d.paidOn as string)}`;
    case "payment.acknowledged":
      return `${n(d.by)} confirmed the money arrived`;
    case "payment.rejected":
      return `${n(d.by)} says the money hasn't arrived`;
    case "reminder.sent":
      return `Dakiya sent a ${d.tone} reminder to ${n(d.to)}`;
    case "penalty.assessed":
      return `Chowkidar: −1 for ${n(d.debtorId)} (month ${d.month} late) → ${d.scoreAfter}`;
  }
}
