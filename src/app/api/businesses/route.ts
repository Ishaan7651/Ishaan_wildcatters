import { allBusinesses, getWorld } from "@/lib/server/views";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = allBusinesses(getWorld()).sort((a, b) => a.name.localeCompare(b.name));
    return Response.json(list);
  } catch (e) {
    return fail(e);
  }
}
