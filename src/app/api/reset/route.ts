import { resetLake } from "@/lib/server/store";
import { forgetPatrols } from "@/lib/server/agents/chowkidar";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Wipes the demo lake and reseeds it relative to today. */
export async function POST() {
  try {
    resetLake();
    forgetPatrols();
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
