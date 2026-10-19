import { getWorld, slipById } from "@/lib/server/views";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/slips/[id]">) {
  try {
    const { id } = await ctx.params;
    const slip = slipById(getWorld(), id);
    if (!slip) return Response.json({ error: "That slip doesn't exist." }, { status: 404 });
    return Response.json(slip);
  } catch (e) {
    return fail(e);
  }
}
