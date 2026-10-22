import { after } from "next/server";
import { openLake } from "@/lib/server/store";
import { getWorld, network } from "@/lib/server/views";
import { locateMissing } from "@/lib/server/geo";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await openLake();
    const net = network(getWorld());
    // Look up any shops we don't have a real location for yet, after answering.
    if (net.locating) after(() => locateMissing().catch((e) => console.error("geocoder", e)));
    return Response.json(net);
  } catch (e) {
    return fail(e);
  }
}
