"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { MotionConfig } from "motion/react";
import type { AgentStep, BoloEvent, BoloResult, Intent } from "@/lib/shared/types";
import { speak, stopSpeaking } from "@/lib/client/speak";

export interface Turn {
  id: string;
  utterance: string;
  source: "voice" | "text";
  at: number;
  actorId: string;
  steps: AgentStep[];
  status: "running" | "done" | "error";
  intent?: Intent;
  result?: BoloResult;
  error?: string;
  ms?: number;
  mode?: "ai" | "offline";
  runId?: string;
  /** Set once the user acted on the result (sent the slip, stamped, …). */
  outcome?: { kind: "sent" | "stamped" | "disputed" | "paid" | "reminded" | "discarded"; slip?: import("@/lib/shared/types").SlipView };
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: "default" | "good" | "warn" | "bad";
  agent?: AgentStep["agent"];
}

export interface ComposerPrefill {
  counterpartyId?: string;
  direction?: "they_owe_me" | "i_owe_them";
}

interface AppCtx {
  actorId: string;
  setActor: (id: string) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  speakAnswers: boolean;
  setSpeakAnswers: (v: boolean) => void;
  slipId: string | null;
  openSlip: (id: string | null) => void;
  composer: ComposerPrefill | null;
  openComposer: (p: ComposerPrefill | null) => void;
  turns: Turn[];
  ask: (utterance: string, source?: "voice" | "text") => Promise<void>;
  clearTurns: () => void;
  updateTurn: (id: string, patch: Partial<Turn>) => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  refreshAll: () => Promise<void>;
  diaryOpen: boolean;
  setDiaryOpen: (v: boolean) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside Providers");
  return c;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: true, dedupingInterval: 1500 }}>
      <MotionConfig reducedMotion="user">
        <AppProvider>{children}</AppProvider>
      </MotionConfig>
    </SWRConfig>
  );
}

const DEFAULT_ACTOR = "iyer-spices";

function AppProvider({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const [actorId, setActorId] = useState(DEFAULT_ACTOR);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [speakAnswers, setSpeakState] = useState(true);
  const [slipId, setSlipId] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerPrefill | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const toastSeq = useRef(0);
  const speakRef = useRef(speakAnswers);
  speakRef.current = speakAnswers;

  useEffect(() => {
    try {
      const a = localStorage.getItem("saakh.actor");
      if (a) setActorId(a);
      const s = localStorage.getItem("saakh.speak");
      if (s) setSpeakState(s === "1");
    } catch {}
    setTheme((document.documentElement.dataset.theme as "light" | "dark") ?? "light");
  }, []);

  const setActor = useCallback((id: string) => {
    setActorId(id);
    try {
      localStorage.setItem("saakh.actor", id);
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("saakh.theme", next);
      } catch {}
      return next;
    });
  }, []);

  const setSpeakAnswers = useCallback((v: boolean) => {
    setSpeakState(v);
    if (!v) stopSpeaking();
    try {
      localStorage.setItem("saakh.speak", v ? "1" : "0");
    } catch {}
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastSeq.current;
    setToasts((xs) => [...xs.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 5200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((xs) => xs.filter((x) => x.id !== id)), []);

  const refreshAll = useCallback(async () => {
    await mutate(() => true, undefined, { revalidate: true });
  }, [mutate]);

  const updateTurn = useCallback((id: string, patch: Partial<Turn>) => {
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const ask = useCallback(
    async (utterance: string, source: "voice" | "text" = "text") => {
      const text = utterance.trim();
      if (!text) return;
      stopSpeaking();
      const id = `turn_${Date.now().toString(36)}`;
      setTurns((ts): Turn[] => [{ id, utterance: text, source, at: Date.now(), actorId, steps: [], status: "running" as const }, ...ts].slice(0, 12));
      const patch = (fn: (t: Turn) => Partial<Turn>) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...fn(t) } : t)));
      try {
        const res = await fetch("/api/bolo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ utterance: text, actorId, source }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? "The agents couldn't be reached.");
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const e = JSON.parse(line) as BoloEvent;
            if (e.type === "step") patch((t) => ({ steps: [...t.steps, e.step] }));
            else if (e.type === "result") {
              patch(() => ({ intent: e.intent, result: e.result }));
              if (speakRef.current) {
                const r = e.result;
                const line =
                  r.kind === "answer" ? r.speech : r.kind === "response" ? r.speech : r.kind === "message" ? r.text : null;
                if (line) speak(line);
              }
              if (e.result.kind === "response" && e.result.applied) refreshAll();
            } else if (e.type === "error") patch(() => ({ status: "error", error: e.message }));
            else if (e.type === "done") patch((t) => ({ status: t.status === "error" ? "error" : "done", ms: e.ms, mode: e.mode, runId: e.runId }));
          }
        }
        patch((t) => (t.status === "running" ? { status: t.result ? "done" : "error", error: t.result ? undefined : "No answer came back." } : {}));
      } catch (err) {
        patch(() => ({ status: "error", error: (err as Error).message }));
      } finally {
        mutate((k) => typeof k === "string" && k.startsWith("/api/agents"));
      }
    },
    [actorId, mutate, refreshAll],
  );

  const value = useMemo<AppCtx>(
    () => ({
      actorId,
      setActor,
      theme,
      toggleTheme,
      speakAnswers,
      setSpeakAnswers,
      slipId,
      openSlip: setSlipId,
      composer,
      openComposer: setComposer,
      turns,
      ask,
      clearTurns: () => setTurns([]),
      updateTurn,
      toasts,
      toast,
      dismissToast,
      refreshAll,
      diaryOpen,
      setDiaryOpen,
    }),
    [actorId, setActor, theme, toggleTheme, speakAnswers, setSpeakAnswers, slipId, composer, turns, ask, updateTurn, toasts, toast, dismissToast, refreshAll, diaryOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
