import { getWorld, profileOf } from "@/lib/server/views";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/businesses/[id]">) {
  try {
    const { id } = await ctx.params;
    const p = profileOf(getWorld(), id);
    if (!p) return Response.json({ error: "That business isn't on Saakh." }, { status: 404 });
    return Response.json(p);
  } catch (e) {
    return fail(e);
  }
}
