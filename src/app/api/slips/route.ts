import { after } from "next/server";
import { getWorld, slipById, slipsFor } from "@/lib/server/views";
import { raiseSlip, type RaiseInput } from "@/lib/server/commands";
import { requestConfirmation } from "@/lib/server/agents/gawah";
import { DEFAULT_ACTOR, body, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const actor = new URL(req.url).searchParams.get("actor") || DEFAULT_ACTOR;
    const list = slipsFor(getWorld(), actor).sort((a, b) => (a.raisedAt > b.raisedAt ? -1 : 1));
    return Response.json(list);
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const input = await body<RaiseInput>(req);
    const { slipId, invited } = raiseSlip(input);
    // Gawah writes to the other side after we've answered.
    after(() => requestConfirmation(slipId).catch((e) => console.error("gawah", e)));
    return Response.json({ slip: slipById(getWorld(), slipId), invited });
  } catch (e) {
    return fail(e);
  }
}
