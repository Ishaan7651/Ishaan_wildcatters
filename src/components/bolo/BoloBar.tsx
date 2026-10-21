"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Mic, PenLine, Square, Volume2, VolumeX } from "lucide-react";
import { useVoice } from "@/lib/client/useVoice";
import { useApp } from "@/components/providers/Providers";

/**
 * The one input. Speak or type anything — a new debt, a question, a "haan" to
 * someone's slip — and Sutradhar sends it to the right agent.
 */
export function BoloBar({ examples, chips = 3 }: { examples: string[]; chips?: number }) {
  const { ask, speakAnswers, setSpeakAnswers, turns, openComposer } = useApp();
  const [text, setText] = useState("");
  const [lang, setLang] = useState<"en-IN" | "hi-IN">("en-IN");
  const [ph, setPh] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = turns.some((t) => t.status === "running");

  const voice = useVoice({
    lang,
    onFinal: (t) => {
      setText("");
      ask(t, "voice");
    },
  });
  const listening = voice.state === "listening";

  useEffect(() => {
    const id = setInterval(() => setPh((p) => p + 1), 3800);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [text]);

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    ask(t, "text");
  };

  const placeholder = examples[ph % Math.max(1, examples.length)] ?? "";

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-[26px] border bg-sheet transition-[border-color,box-shadow] duration-300",
        listening
          ? "border-stamp/50 shadow-[0_0_0_6px_color-mix(in_oklab,var(--stamp)_12%,transparent),var(--shadow-lift)]"
          : "border-rule shadow-[var(--shadow-lift)] focus-within:border-mor/50",
      )}
    >
      {/* marigold glow behind the mic */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full opacity-60 transition-opacity"
        style={{ background: `radial-gradient(circle, color-mix(in oklab, ${listening ? "var(--stamp)" : "var(--genda)"} 30%, transparent), transparent 65%)` }}
      />

      <div className="relative flex items-start gap-4 p-4 sm:gap-6 sm:p-6">
        <div className="flex flex-col items-center gap-2 pt-1">
          <MicButton state={voice.state} disabled={!voice.supported || busy} onClick={() => (listening ? voice.stop() : voice.start())} />
          <span className={clsx("text-[11px] font-semibold", listening ? "text-stamp" : "text-ink-3")}>
            {listening ? "Listening" : voice.state === "transcribing" ? "Writing…" : <span className="font-deva">बोलो</span>}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative pt-1">
            <textarea
              ref={inputRef}
              rows={1}
              value={listening ? voice.interim : text}
              readOnly={listening}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              aria-label="Say who owes whom, or ask about a score"
              className="hand dotted-under block w-full resize-none bg-transparent pb-2 text-[22px] leading-[1.35] text-mor-ink outline-none focus-visible:outline-none sm:text-[26px]"
            />
            {!text && !listening && !voice.interim && (
              <AnimatePresence mode="wait">
                <motion.span
                  key={placeholder}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                  className="hand pointer-events-none absolute inset-x-0 top-1 truncate text-[22px] leading-[1.35] text-ink-4 sm:text-[26px]"
                  aria-hidden
                >
                  {placeholder}
                </motion.span>
              </AnimatePresence>
            )}
          </div>

          <div className="mt-2.5 flex items-center gap-1">
            <div className="flex rounded-full bg-paper-deep p-0.5 text-[11px] font-semibold" role="group" aria-label="Voice language">
              {(["en-IN", "hi-IN"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={clsx("rounded-full px-2.5 py-0.5 transition-colors", lang === l ? "bg-sheet text-ink shadow-sm" : "text-ink-3 hover:text-ink")}
                  aria-pressed={lang === l}
                >
                  {l === "en-IN" ? "EN" : <span className="font-deva">हिं</span>}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSpeakAnswers(!speakAnswers)}
              className="grid size-7 place-items-center rounded-full text-ink-3 hover:bg-paper-deep hover:text-ink"
              aria-label={speakAnswers ? "Stop reading answers aloud" : "Read answers aloud"}
              title={speakAnswers ? "Answers are read aloud" : "Answers are silent"}
            >
              {speakAnswers ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <p className="ml-2 min-w-0 flex-1 truncate text-[12px] text-stamp">{voice.error}</p>
            <button
              onClick={submit}
              disabled={!text.trim() || busy || listening}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-mor text-on-mor transition-[opacity,transform] hover:scale-105 disabled:scale-100 disabled:opacity-25"
              aria-label="Send"
            >
              <ArrowUp size={19} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>

      {/* live loudness trace */}
      <div className={clsx("relative flex items-center justify-center gap-[3px] px-5 transition-all", listening ? "h-10 pb-3 opacity-100" : "h-0 opacity-0")} aria-hidden>
        {voice.levels.map((v, i) => (
          <span key={i} className="w-[3px] rounded-full bg-stamp/75" style={{ height: `${Math.max(3, v * 28)}px`, transition: "height 90ms linear" }} />
        ))}
      </div>

      {chips > 0 && !listening && (
        <div className="relative flex flex-wrap items-center gap-1.5 border-t border-rule/80 bg-sheet-2/80 px-4 py-3 sm:px-6">
          {examples.slice(0, chips).map((e) => (
            <button
              key={e}
              onClick={() => ask(e)}
              disabled={busy}
              className="hand max-w-full truncate rounded-full border border-rule-2 bg-sheet px-3 py-0.5 text-left text-[15px] text-mor-ink transition-colors hover:border-genda-2 hover:bg-genda-soft disabled:opacity-50"
            >
              {e}
            </button>
          ))}
          <button onClick={() => openComposer({})} className="ml-auto flex items-center gap-1.5 rounded-full px-2 py-1 text-[12.5px] font-medium text-ink-3 hover:bg-paper-deep hover:text-ink">
            <PenLine size={13} /> Write
          </button>
        </div>
      )}
    </div>
  );
}

function MicButton({ state, onClick, disabled }: { state: "idle" | "listening" | "transcribing"; onClick: () => void; disabled?: boolean }) {
  const listening = state === "listening";
  return (
    <button
      onClick={onClick}
      disabled={disabled && !listening}
      aria-label={listening ? "Stop listening" : "Speak"}
      aria-pressed={listening}
      className={clsx(
        "group relative grid size-16 shrink-0 place-items-center rounded-full transition-[background,transform] active:scale-95 sm:size-[76px]",
        listening ? "bg-stamp text-white" : "bg-genda text-on-genda hover:scale-105 hover:bg-genda-2",
        disabled && !listening && "opacity-40",
      )}
    >
      {listening ? (
        <>
          <span className="absolute inset-0 rounded-full bg-stamp/40" style={{ animation: "pulse-ring 1.6s ease-out infinite" }} />
          <span className="absolute inset-0 rounded-full bg-stamp/30" style={{ animation: "pulse-ring 1.6s .5s ease-out infinite" }} />
        </>
      ) : (
        state === "idle" && !disabled && <span className="absolute -inset-1.5 rounded-full border-2 border-genda" style={{ animation: "breathe 3.2s ease-in-out infinite" }} aria-hidden />
      )}
      <span className="relative">
        {state === "transcribing" ? (
          <span className="block size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : listening ? (
          <Square size={20} fill="currentColor" />
        ) : (
          <Mic size={30} strokeWidth={2.2} />
        )}
      </span>
    </button>
  );
}
