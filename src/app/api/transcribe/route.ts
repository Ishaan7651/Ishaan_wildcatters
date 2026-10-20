import { AUDIO_MODEL, chat, hasKey } from "@/lib/server/ai/openrouter";
import { body, fail } from "@/lib/server/http";
import { CommandError } from "@/lib/server/commands";
import { openLake } from "@/lib/server/store";
import { getWorld } from "@/lib/server/views";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Fallback speech-to-text for browsers without the Web Speech API (e.g.
 * Firefox). The browser records WAV; an audio-capable model transcribes it.
 */
export async function POST(req: Request) {
  try {
    if (!hasKey()) throw new CommandError("Voice in this browser needs the AI key. Type instead, or use Chrome/Edge.", 503);
    const { audio } = await body<{ audio: string }>(req);
    if (!audio || audio.length > 8_000_000) throw new CommandError("The recording was empty or too long.");
    await openLake();
    const names = [...getWorld().businesses.values()].map((b) => b.name).join(", ");
    const res = await chat({
      model: AUDIO_MODEL,
      maxTokens: 1200,
      reasoning: { effort: "low" },
      temperature: 0,
      timeoutMs: 30_000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Transcribe this voice note from an Indian shop owner. It may be English, Hindi or Hinglish. Write Hindi words in Latin script (e.g. 'do hazaar'), write amounts as digits. Businesses on Saakh include: " + names + ". If a name sounds like one of these, spell it that way; otherwise keep it as heard. Reply with the transcript only.",
            },
            { type: "input_audio", input_audio: { data: audio, format: "wav" } },
          ],
        },
      ],
    });
    return Response.json({ text: (res.message.content ?? "").trim().replace(/^"|"$/g, "") });
  } catch (e) {
    return fail(e);
  }
}
