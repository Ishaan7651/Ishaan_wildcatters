import { verifyChain } from "@/lib/server/store";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const t0 = performance.now();
    const r = await verifyChain();
    return Response.json({ ...r, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    return fail(e);
  }
}
