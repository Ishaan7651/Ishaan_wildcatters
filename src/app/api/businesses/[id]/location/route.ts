import { openLake } from "@/lib/server/store";
import { placeBusiness } from "@/lib/server/commands";
import { body, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/businesses/[id]/location">) {
  try {
    const { id } = await ctx.params;
    const { actorId, lat, lng } = await body<{ actorId: string; lat: number; lng: number }>(req);
    await openLake();
    return Response.json(await placeBusiness(actorId, id, Number(lat), Number(lng)));
  } catch (e) {
    return fail(e);
  }
}
