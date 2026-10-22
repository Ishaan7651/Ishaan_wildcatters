// Commands: the only way facts get into the lake. Each one checks that the
// actor is allowed to do it right now, then appends events.

import crypto from "node:crypto";
import type { Business } from "@/lib/shared/types";
import { istDay } from "@/lib/shared/dates";
import { appendEvents, type EventDraft } from "./store";
import { confirmerOf, getWorld, raiserOf, slipView } from "./views";
import { reverse } from "./geo";
import type { World } from "./project";

export class CommandError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function mustSlip(world: World, slipId: string) {
  const s = world.slips.get(slipId);
  if (!s) throw new CommandError("That slip doesn't exist.", 404);
  return s;
}

function mustBiz(world: World, id: string) {
  const b = world.businesses.get(id);
  if (!b) throw new CommandError("That business isn't on Saakh.", 404);
  return b;
}

function newCode(world: World) {
  const taken = new Set([...world.slips.values()].map((s) => s.code));
  for (;;) {
    const code = "SKH-" + crypto.randomBytes(3).toString("hex").slice(0, 4).toUpperCase();
    if (!taken.has(code)) return code;
  }
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 32) || "biz";

export interface RaiseInput {
  actorId: string;
  direction: "they_owe_me" | "i_owe_them";
  counterpartyId?: string;
  newCounterparty?: { name: string; city?: string; owner?: string };
  amount: number;
  dueDate: string;
  note?: string;
  source?: "voice" | "text" | "form";
  utterance?: string;
}

export async function raiseSlip(input: RaiseInput) {
  const world = getWorld();
  const actor = mustBiz(world, input.actorId);
  const drafts: EventDraft[] = [];

  let counterparty: Business | undefined = input.counterpartyId ? world.businesses.get(input.counterpartyId) : undefined;
  if (!counterparty) {
    const nm = input.newCounterparty?.name?.trim();
    if (!nm) throw new CommandError("Say who the slip is with.");
    const existing = [...world.businesses.values()].find((b) => b.name.toLowerCase() === nm.toLowerCase());
    if (existing) counterparty = existing;
    else {
      let id = slug(nm);
      while (world.businesses.has(id)) id += "-" + crypto.randomBytes(1).toString("hex");
      counterparty = {
        id,
        name: nm,
        owner: input.newCounterparty?.owner?.trim() || nm.split(" ")[0],
        category: "Invited business",
        city: input.newCounterparty?.city?.trim() || actor.city,
        market: "Invited via Saakh",
        phone: "Not shared yet",
        joinedOn: world.today,
        lat: actor.lat + (Math.random() - 0.5) * 0.6,
        lng: actor.lng + (Math.random() - 0.5) * 0.6,
        invitedBy: actor.id,
      };
      drafts.push({ type: "business.registered", actor: actor.id, data: { ...counterparty } });
    }
  }
  if (counterparty.id === actor.id) throw new CommandError("A slip needs two different businesses.");

  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new CommandError("The amount must be more than ₹0.");
  if (amount > 10_00_00_000) throw new CommandError("Saakh slips go up to ₹10 crore.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new CommandError("The due date isn't a valid date.");

  const theyOwe = input.direction === "they_owe_me";
  const slipId = "slip_" + crypto.randomBytes(5).toString("hex");
  const code = newCode(world);
  drafts.push({
    type: "slip.raised",
    actor: actor.id,
    data: {
      slipId,
      code,
      creditorId: theyOwe ? actor.id : counterparty.id,
      debtorId: theyOwe ? counterparty.id : actor.id,
      amount,
      dueDate: input.dueDate,
      note: (input.note ?? "").slice(0, 160),
      raisedBy: theyOwe ? "creditor" : "debtor",
      source: input.source ?? "form",
      utterance: input.utterance?.slice(0, 300),
    },
  });
  await appendEvents(drafts);
  return { slipId, counterpartyId: counterparty.id, invited: !!counterparty.invitedBy && counterparty.invitedBy === actor.id };
}

export async function confirmSlip(actorId: string, slipId: string) {
  const world = getWorld();
  const s = mustSlip(world, slipId);
  if (s.status !== "awaiting") throw new CommandError("This slip isn't waiting for confirmation.", 409);
  if (confirmerOf(s) !== actorId) throw new CommandError("Only the other side of the slip can confirm it.", 403);
  await appendEvents([{ type: "slip.confirmed", actor: actorId, data: { slipId, by: actorId } }]);
}

export async function disputeSlip(actorId: string, slipId: string, reason: string, counterAmount?: number) {
  const world = getWorld();
  const s = mustSlip(world, slipId);
  if (s.status !== "awaiting") throw new CommandError("This slip isn't waiting for confirmation.", 409);
  if (confirmerOf(s) !== actorId) throw new CommandError("Only the other side of the slip can dispute it.", 403);
  const counter = counterAmount && counterAmount > 0 && Math.round(counterAmount) !== s.amount ? Math.round(counterAmount) : undefined;
  await appendEvents([{ type: "slip.disputed", actor: actorId, data: { slipId, by: actorId, reason: reason.slice(0, 240), ...(counter ? { counterAmount: counter } : {}) } }]);
}

export async function acceptCounter(actorId: string, slipId: string) {
  const world = getWorld();
  const s = mustSlip(world, slipId);
  if (s.status !== "countered" || !s.dispute?.counterAmount) throw new CommandError("There's no revised amount to accept.", 409);
  if (raiserOf(s) !== actorId) throw new CommandError("Only the person who raised the slip can accept the revision.", 403);
  await appendEvents([{ type: "slip.counter_accepted", actor: actorId, data: { slipId, by: actorId, amount: s.dispute.counterAmount } }]);
}

export async function withdrawSlip(actorId: string, slipId: string) {
  const world = getWorld();
  const s = mustSlip(world, slipId);
  if (!["awaiting", "disputed", "countered"].includes(s.status)) throw new CommandError("Confirmed slips can't be withdrawn.", 409);
  if (raiserOf(s) !== actorId) throw new CommandError("Only the person who raised the slip can withdraw it.", 403);
  await appendEvents([{ type: "slip.withdrawn", actor: actorId, data: { slipId, by: actorId } }]);
}

export async function recordPayment(actorId: string, slipId: string, paidOn?: string) {
  const world = getWorld();
  const s = mustSlip(world, slipId);
  if (s.status !== "confirmed") throw new CommandError("Only confirmed slips can be paid.", 409);
  const role = actorId === s.creditorId ? "creditor" : actorId === s.debtorId ? "debtor" : null;
  if (!role) throw new CommandError("You're not part of this slip.", 403);
  if (role === "debtor" && s.payment && !s.payment.acknowledged) throw new CommandError("Your payment is already waiting for their confirmation.", 409);
  const day = paidOn && /^\d{4}-\d{2}-\d{2}$/.test(paidOn) ? paidOn : world.today;
  if (day > world.today) throw new CommandError("The payment date can't be in the future.");
  if (day < istDay(s.raisedAt)) throw new CommandError("The payment date is before the slip was raised.");
  await appendEvents([{ type: "payment.recorded", actor: actorId, data: { slipId, by: actorId, role, paidOn: day, amount: s.amount } }]);
  return role;
}

export async function acknowledgePayment(actorId: string, slipId: string, accept: boolean) {
  const world = getWorld();
  const s = mustSlip(world, slipId);
  if (!s.payment || s.payment.acknowledged) throw new CommandError("There's no payment waiting for confirmation.", 409);
  if (actorId !== s.creditorId) throw new CommandError("Only the lender can confirm a payment arrived.", 403);
  await appendEvents([
    accept
      ? { type: "payment.acknowledged", actor: actorId, data: { slipId, by: actorId } }
      : { type: "payment.rejected", actor: actorId, data: { slipId, by: actorId, reason: "Not received" } },
  ]);
}

export function currentSlip(slipId: string) {
  const world = getWorld();
  const s = world.slips.get(slipId);
  return s ? slipView(world, s) : null;
}

export async function placeBusiness(actorId: string, bizId: string, lat: number, lng: number) {
  const world = getWorld();
  const b = mustBiz(world, bizId);
  if (b.id !== actorId) throw new CommandError("Only a business can move its own pin.", 403);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 6 || lat > 37.5 || lng < 68 || lng > 97.5)
    throw new CommandError("Saakh pins have to be in India.");
  const address = await reverse(lat, lng);
  await appendEvents([
    { type: "business.located", actor: actorId, data: { id: bizId, lat, lng, address, precision: "pin", source: "owner" } },
  ]);
  return { lat, lng, address };
}
