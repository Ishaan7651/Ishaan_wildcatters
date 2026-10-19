import {
  CommandError,
  acceptCounter,
  acknowledgePayment,
  confirmSlip,
  currentSlip,
  disputeSlip,
  recordPayment,
  withdrawSlip,
} from "@/lib/server/commands";
import { body, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type Action = "confirm" | "dispute" | "accept_counter" | "withdraw" | "record_payment" | "ack_payment" | "reject_payment";

export async function POST(req: Request, ctx: RouteContext<"/api/slips/[id]/action">) {
  try {
    const { id } = await ctx.params;
    const b = await body<{ actorId: string; action: Action; reason?: string; amount?: number; paidOn?: string }>(req);
    if (!b.actorId) throw new CommandError("Pick which business you are first.");
    switch (b.action) {
      case "confirm":
        confirmSlip(b.actorId, id);
        break;
      case "dispute":
        disputeSlip(b.actorId, id, b.reason ?? "", b.amount);
        break;
      case "accept_counter":
        acceptCounter(b.actorId, id);
        break;
      case "withdraw":
        withdrawSlip(b.actorId, id);
        break;
      case "record_payment":
        recordPayment(b.actorId, id, b.paidOn);
        break;
      case "ack_payment":
        acknowledgePayment(b.actorId, id, true);
        break;
      case "reject_payment":
        acknowledgePayment(b.actorId, id, false);
        break;
      default:
        throw new CommandError("Unknown action.");
    }
    return Response.json({ slip: currentSlip(id) });
  } catch (e) {
    return fail(e);
  }
}
