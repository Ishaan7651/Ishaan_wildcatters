import { CommandError } from "./commands";

export const DEFAULT_ACTOR = "iyer-spices";

export function fail(e: unknown) {
  if (e instanceof CommandError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new CommandError("The request body wasn't valid JSON.");
  }
}
