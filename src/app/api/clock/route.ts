import { after } from "next/server";
import { getSimDay, nowISO, openLake, setSimDay } from "@/lib/server/store";
import { istDay } from "@/lib/shared/dates";
import { claimPatrol, patrolFollowUp, patrolNow } from "@/lib/server/agents/chowkidar";
import { CommandError } from "@/lib/server/commands";
import { body, fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

function info() {
  const real = istDay();
  const sim = getSimDay();
  return { today: istDay(nowISO()), realToday: real, simulated: !!sim && sim !== real, nowISO: nowISO() };
}

export async function GET() {
  try {
    await openLake();
    return Response.json(info());
  } catch (e) {
    return fail(e);
  }
}

/** Move the Saakh clock. Chowkidar patrols the new day straight away. */
export async function POST(req: Request) {
  try {
    const { day } = await body<{ day: string | null }>(req);
    if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new CommandError("That isn't a valid date.");
    await openLake();
    await setSimDay(day === istDay() ? null : day);
    let patrol = null;
    if (await claimPatrol()) {
      const outcome = await patrolNow("Time machine");
      patrol = { newPoints: outcome.newPoints.length, overdue: outcome.overdue };
      after(() => patrolFollowUp(outcome).catch((e) => console.error("patrol follow-up", e)));
    }
    return Response.json({ ...info(), patrol });
  } catch (e) {
    return fail(e);
  }
}
