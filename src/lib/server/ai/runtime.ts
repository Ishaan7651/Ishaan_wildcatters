// Agent runtime: records every step an agent takes (for the diary and the
// live trace in the UI) and runs the tool-calling loop against the model.

import crypto from "node:crypto";
import type { AgentName, AgentRun, AgentStep, StepKind } from "@/lib/shared/types";
import { appendRun, nowISO, today } from "../store";
import { chat, type ChatMessage, type ToolSpec, MODEL } from "./openrouter";

export class RunRecorder {
  readonly id = "run_" + crypto.randomBytes(5).toString("hex");
  readonly steps: AgentStep[] = [];
  private readonly t0 = Date.now();
  tokens = 0;
  model?: string;
  mode: "ai" | "offline" = "ai";
  agent: AgentName;

  constructor(
    agent: AgentName,
    readonly trigger: string,
    readonly actorId?: string,
    private readonly emit?: (s: AgentStep) => void,
  ) {
    this.agent = agent;
  }

  step(agent: AgentName, kind: StepKind, label: string, detail?: string) {
    const s: AgentStep = { agent, kind, label, detail, ms: Date.now() - this.t0 };
    this.steps.push(s);
    this.emit?.(s);
    return s;
  }

  get elapsed() {
    return Date.now() - this.t0;
  }

  finish(summary: string, status: "ok" | "error" = "ok"): AgentRun {
    const run: AgentRun = {
      id: this.id,
      agent: this.agent,
      trigger: this.trigger,
      actorId: this.actorId,
      startedAt: nowISO(),
      simDay: today(),
      durationMs: this.elapsed,
      status,
      mode: this.mode,
      model: this.mode === "ai" ? this.model ?? MODEL : undefined,
      summary,
      steps: this.steps,
      tokens: this.tokens || undefined,
    };
    appendRun(run);
    return run;
  }
}

export interface AgentTool {
  spec: ToolSpec;
  /** Returns the JSON the model sees, plus a one-line note for the trace. */
  run: (args: Record<string, unknown>) => { data: unknown; note: string };
  label?: (args: Record<string, unknown>) => string;
}

/**
 * Runs a tool loop until the agent calls its `final` tool, whose arguments are
 * returned. Every turn must call a tool, so the agent can't wander off into
 * free text.
 */
export async function runAgent(opts: {
  rec: RecLike;
  agent: AgentName;
  system: string;
  user: string;
  tools: AgentTool[];
  final: ToolSpec;
  maxTurns?: number;
  model?: string;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  const { rec, agent } = opts;
  const byName = new Map(opts.tools.map((t) => [t.spec.function.name, t]));
  const finalName = opts.final.function.name;
  const specs = [...opts.tools.map((t) => t.spec), opts.final];
  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  const maxTurns = opts.maxTurns ?? 5;

  for (let turn = 0; turn < maxTurns; turn++) {
    const last = turn === maxTurns - 1;
    const res = await chat({
      messages,
      tools: last ? [opts.final] : specs,
      toolChoice: last ? { type: "function", function: { name: finalName } } : "required",
      model: opts.model,
      maxTokens: opts.maxTokens,
    });
    rec.tokens += res.tokens;
    rec.model = res.model;
    const calls = res.message.tool_calls ?? [];
    if (!calls.length) {
      messages.push({ role: "assistant", content: res.message.content ?? "" });
      messages.push({ role: "user", content: `Call a tool. When you're done, call ${finalName}.` });
      continue;
    }
    messages.push({ role: "assistant", content: res.message.content ?? null, tool_calls: calls });
    if (res.message.content?.trim()) rec.step(agent, "think", clip(res.message.content.trim(), 140));

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Arguments were not valid JSON." }) });
        continue;
      }
      if (call.function.name === finalName) return args;
      const t = byName.get(call.function.name);
      if (!t) {
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: `No tool named ${call.function.name}.` }) });
        continue;
      }
      let out: { data: unknown; note: string };
      try {
        out = t.run(args);
      } catch (e) {
        out = { data: { error: (e as Error).message }, note: (e as Error).message };
      }
      rec.step(agent, "tool", t.label ? t.label(args) : `${call.function.name}(${shortArgs(args)})`, out.note);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out.data) });
    }
  }
  throw new Error(`${agent} didn't finish.`);
}

type RecLike = Pick<RunRecorder, "step" | "tokens" | "model">;

export function shortArgs(args: Record<string, unknown>) {
  return Object.values(args)
    .filter((v) => v !== undefined && v !== null && v !== "")
    .map((v) => (typeof v === "string" ? `"${clip(v, 28)}"` : String(v)))
    .join(", ");
}

export function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
