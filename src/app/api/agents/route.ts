import { openLake, readRuns, nowISO } from "@/lib/server/store";
import { aiInfo } from "@/lib/server/ai/openrouter";
import { AGENT_ORDER } from "@/lib/shared/agents";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(300, Number(url.searchParams.get("limit")) || 60);
    const agent = url.searchParams.get("agent");
    await openLake();
    const now = nowISO();
    const runs = (await readRuns())
      .filter((r) => r.startedAt <= now)
      .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
    const stats = AGENT_ORDER.map((name) => {
      const mine = runs.filter((r) => r.agent === name || r.steps.some((s) => s.agent === name));
      const own = runs.filter((r) => r.agent === name);
      return {
        name,
        runs: mine.length,
        lastAt: mine.length ? mine[mine.length - 1].startedAt : null,
        avgMs: own.length ? Math.round(own.reduce((a, r) => a + r.durationMs, 0) / own.length) : null,
        tokens: own.reduce((a, r) => a + (r.tokens ?? 0), 0),
      };
    });
    const list = runs
      .filter((r) => !agent || r.agent === agent || r.steps.some((s) => s.agent === agent))
      .slice(-limit)
      .reverse();
    return Response.json({ runs: list, stats, ai: aiInfo(), total: runs.length });
  } catch (e) {
    return fail(e);
  }
}
