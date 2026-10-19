import { getWorld, slipById } from "@/lib/server/views";
import { CommandError } from "@/lib/server/commands";
import { composeReminder, deliverReminder } from "@/lib/server/agents/dakiya";
import { body, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Draft (dryRun) or send a reminder. Without a message, Dakiya writes one. */
export async function POST(req: Request, ctx: RouteContext<"/api/slips/[id]/remind">) {
  try {
    const { id } = await ctx.params;
    const b = await body<{ actorId: string; message?: string; tone?: string; dryRun?: boolean }>(req);
    const world = getWorld();
    const slip = slipById(world, id);
    if (!slip) throw new CommandError("That slip doesn't exist.", 404);
    if (slip.creditor.id !== b.actorId) throw new CommandError("Only the lender can send a reminder.", 403);
    let message = b.message?.trim();
    let tone = b.tone ?? "gentle";
    if (!message) ({ message, tone } = await composeReminder(world, slip));
    if (b.dryRun) return Response.json({ message, tone });
    deliverReminder(b.actorId, id, message, tone);
    return Response.json({ message, tone, slip: slipById(getWorld(), id) });
  } catch (e) {
    return fail(e);
  }
}
