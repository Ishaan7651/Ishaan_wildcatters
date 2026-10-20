import { after } from "next/server";
import { appState, getWorld } from "@/lib/server/views";
import { openLake } from "@/lib/server/store";
import { claimPatrol, patrolFollowUp, patrolNow } from "@/lib/server/agents/chowkidar";
import { DEFAULT_ACTOR, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const actor = new URL(req.url).searchParams.get("actor") || DEFAULT_ACTOR;
    // Chowkidar walks once per Saakh day, the first time anyone opens the app.
    await openLake();
    if (await claimPatrol()) {
      const outcome = await patrolNow("Daily patrol");
      after(() => patrolFollowUp(outcome).catch((e) => console.error("patrol follow-up", e)));
    }
    const state = appState(getWorld(), actor);
    if (!state) return Response.json({ error: "That business isn't on Saakh." }, { status: 404 });
    return Response.json(state);
  } catch (e) {
    return fail(e);
  }
}
