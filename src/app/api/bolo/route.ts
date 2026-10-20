import type { BoloEvent } from "@/lib/shared/types";
import { openLake } from "@/lib/server/store";
import { bolo } from "@/lib/server/agents/bolo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Streams agent steps as NDJSON while the agents work, then the result. */
export async function POST(req: Request) {
  let input: { utterance?: string; actorId?: string; source?: "voice" | "text" };
  try {
    input = await req.json();
  } catch {
    return Response.json({ error: "The request body wasn't valid JSON." }, { status: 400 });
  }
  const utterance = (input.utterance ?? "").trim().slice(0, 500);
  if (!utterance || !input.actorId) return Response.json({ error: "Say something first." }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: BoloEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        await openLake();
        await bolo({ utterance, actorId: input.actorId!, source: input.source === "voice" ? "voice" : "text" }, emit);
      } catch (e) {
        emit({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
