import { openLake } from "@/lib/server/store";
import { fullPatrol } from "@/lib/server/agents/chowkidar";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    await openLake();
    const run = await fullPatrol("Patrol on request");
    return Response.json({ run });
  } catch (e) {
    return fail(e);
  }
}
