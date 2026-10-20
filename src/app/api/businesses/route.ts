import { openLake } from "@/lib/server/store";
import { allBusinesses, getWorld } from "@/lib/server/views";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await openLake();
    const list = allBusinesses(getWorld()).sort((a, b) => a.name.localeCompare(b.name));
    return Response.json(list);
  } catch (e) {
    return fail(e);
  }
}
