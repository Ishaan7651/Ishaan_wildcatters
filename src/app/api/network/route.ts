import { openLake } from "@/lib/server/store";
import { getWorld, network } from "@/lib/server/views";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await openLake();
    return Response.json(network(getWorld()));
  } catch (e) {
    return fail(e);
  }
}
