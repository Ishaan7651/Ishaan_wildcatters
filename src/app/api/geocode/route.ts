import { searchPlace } from "@/lib/server/geo";

export const dynamic = "force-dynamic";

// Address search for placing a shop on the map, via OpenStreetMap.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 120);
  if (!q || q.length < 3) return Response.json({ error: "Type a bit more of the address." }, { status: 400 });
  const hit = await searchPlace(q);
  if (!hit) return Response.json({ error: "OpenStreetMap couldn't find that place." }, { status: 404 });
  return Response.json(hit);
}
