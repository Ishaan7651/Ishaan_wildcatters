"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { useVoice } from "@/lib/client/useVoice";
import { useApp } from "@/components/providers/Providers";

/**
 * The one input. Speak or type anything — a new debt, a question, a "haan" to
 * someone's slip — and Sutradhar sends it to the right agent.
 */
export function BoloBar({ examples }: { examples: string[] }) {
  const { ask, speakAnswers, setSpeakAnswers, turns } = useApp();
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
    <div className="relative">
      <div
        className={clsx(
          "relative overflow-hidden rounded-[22px] border bg-sheet transition-[border-color,box-shadow] duration-300",
          listening ? "border-stamp/50 shadow-[0_0_0_5px_color-mix(in_oklab,var(--stamp)_12%,transparent),var(--shadow-lift)]" : "border-rule-2 shadow-[var(--shadow-lift)] focus-within:border-carbon/60",
        )}
      >
        <div className="flex items-start gap-3.5 p-3.5 sm:gap-5 sm:p-5">
          <MicButton
            state={voice.state}
            disabled={!voice.supported || busy}
            onClick={() => (listening ? voice.stop() : voice.start())}
          />

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow">
                {listening ? <span className="text-stamp">Listening — speak naturally</span> : voice.state === "transcribing" ? "Writing down what you said…" : "Bolo · speak or type"}
              </span>
              <div className="flex items-center gap-1">
                <div className="flex rounded-full bg-paper-deep p-0.5 text-[11px] font-semibold" role="group" aria-label="Voice language">
                  {(["en-IN", "hi-IN"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={clsx("rounded-full px-2 py-0.5", lang === l ? "bg-sheet text-ink shadow-sm" : "text-ink-3")}
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
              </div>
            </div>

            <div className="relative mt-1.5">
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
                className="hand dotted-under block w-full resize-none bg-transparent pb-1.5 text-[21px] leading-[1.35] text-carbon-ink outline-none focus-visible:outline-none sm:text-[24px]"
              />
              {!text && !listening && !voice.interim && (
                <AnimatePresence mode="wait">
                  <motion.span
                    key={placeholder}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.35 }}
                    className="hand pointer-events-none absolute inset-x-0 top-0 truncate text-[21px] leading-[1.35] text-ink-4 sm:text-[24px]"
                    aria-hidden
                  >
                    {placeholder}
                  </motion.span>
                </AnimatePresence>
              )}
            </div>

            <div className="mt-2.5 flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
                {voice.error ? (
                  <span className="text-stamp">{voice.error}</span>
                ) : listening ? (
                  "Tap the mic again when you're done."
                ) : (
                  <>English, Hindi or Hinglish · <span className="hidden sm:inline">press <b>/</b> to type, </span><b>Enter</b> to send</>
                )}
              </p>
              <button
                onClick={submit}
                disabled={!text.trim() || busy || listening}
                className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-sheet transition-opacity disabled:opacity-25"
                aria-label="Send"
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* live loudness trace */}
        <div className={clsx("flex items-center justify-center gap-[3px] px-5 transition-all", listening ? "h-10 pb-3 opacity-100" : "h-0 opacity-0")} aria-hidden>
          {voice.levels.map((v, i) => (
            <span key={i} className="w-[3px] rounded-full bg-stamp/75" style={{ height: `${Math.max(3, v * 28)}px`, transition: "height 90ms linear" }} />
          ))}
        </div>
      </div>
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
        "relative grid size-14 shrink-0 place-items-center rounded-full text-white transition-colors sm:size-[68px] dark:text-[#0d0e20]",
        listening ? "bg-stamp" : "bg-carbon hover:bg-carbon-2",
        disabled && !listening && "opacity-40",
      )}
    >
      {listening && (
        <>
          <span className="absolute inset-0 rounded-full bg-stamp/40" style={{ animation: "pulse-ring 1.6s ease-out infinite" }} />
          <span className="absolute inset-0 rounded-full bg-stamp/30" style={{ animation: "pulse-ring 1.6s .5s ease-out infinite" }} />
        </>
      )}
      <span className="relative">
        {state === "transcribing" ? (
          <span className="block size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : listening ? (
          <Square size={20} fill="currentColor" />
        ) : (
          <Mic size={26} />
        )}
      </span>
      {!listening && state === "idle" && <span className="absolute -bottom-5 font-deva text-[11px] font-semibold text-carbon">बोलो</span>}
    </button>
  );
}
