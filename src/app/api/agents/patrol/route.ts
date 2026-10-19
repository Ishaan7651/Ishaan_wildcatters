import { fullPatrol } from "@/lib/server/agents/chowkidar";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const run = await fullPatrol("Patrol on request");
    return Response.json({ run });
  } catch (e) {
    return fail(e);
  }
}
