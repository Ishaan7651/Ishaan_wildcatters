// Thin OpenRouter client (OpenAI-compatible chat completions with tools).

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export const MODEL = process.env.SAAKH_MODEL || "anthropic/claude-haiku-5.5";
export const ROUTER_MODEL = process.env.SAAKH_ROUTER_MODEL || MODEL;
export const AUDIO_MODEL = process.env.SAAKH_AUDIO_MODEL || "google/gemini-3.5-flash-lite";

/**
 * Extended thinking is off by default: these are short, tool-driven turns where
 * latency matters, and some models will otherwise spend the whole token budget
 * thinking and return no text. Set SAAKH_REASONING=low|medium|high to turn it on.
 */
const REASONING = process.env.SAAKH_REASONING ? { effort: process.env.SAAKH_REASONING } : { enabled: false };

export function hasKey() {
  return !!process.env.OPENROUTER_API_KEY;
}

export function aiInfo(): { mode: "ai" | "offline"; model: string } {
  return hasKey() ? { mode: "ai", model: MODEL } : { mode: "offline", model: "rules engine" };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatContent = string | ({ type: "text"; text: string } | { type: "input_audio"; input_audio: { data: string; format: string } })[];

export type ChatMessage =
  | { role: "system" | "user"; content: ChatContent }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatResult {
  message: { content: string | null; tool_calls?: ToolCall[] };
  model: string;
  tokens: number;
}

export class AIError extends Error {}

export async function chat(opts: {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  toolChoice?: "auto" | "required" | { type: "function"; function: { name: string } };
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Override the reasoning setting; null leaves it to the model's default. */
  reasoning?: Record<string, unknown> | null;
}): Promise<ChatResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AIError("No OpenRouter key configured.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const send = (reasoning: Record<string, unknown> | null) =>
      fetch(ENDPOINT, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.SAAKH_PUBLIC_URL || "http://localhost:3000",
          "X-Title": "Saakh",
        },
        body: JSON.stringify({
          model: opts.model ?? MODEL,
          messages: opts.messages,
          ...(opts.tools?.length ? { tools: opts.tools, tool_choice: opts.toolChoice ?? "auto", parallel_tool_calls: true } : {}),
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 900,
          ...(reasoning ? { reasoning } : {}),
        }),
      });
    const wanted = opts.reasoning === undefined ? REASONING : opts.reasoning;
    let res = await send(wanted);
    // Some models insist on thinking; ask again with their default.
    if (res.status === 400 && wanted) {
      const peek = await res.clone().text();
      if (/reasoning/i.test(peek)) res = await send(null);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new AIError(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      choices?: { message: ChatResult["message"] }[];
      model?: string;
      usage?: { total_tokens?: number };
      error?: { message?: string };
    };
    if (json.error || !json.choices?.length) throw new AIError(json.error?.message ?? "Empty response from model.");
    return { message: json.choices[0].message, model: json.model ?? opts.model ?? MODEL, tokens: json.usage?.total_tokens ?? 0 };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new AIError("The model took too long to answer.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolSpec {
  return {
    type: "function",
    function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
  };
}
