import { openLake, readLake } from "@/lib/server/store";
import { fail } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await openLake();
    const body = readLake().map((e) => JSON.stringify(e)).join("\n") + "\n";
    return new Response(body, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="saakh-lake-${new Date().toISOString().slice(0, 10)}.jsonl"`,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
