"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type State = "idle" | "listening" | "transcribing";

interface SR {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getSR(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const BARS = 56;
/** Stops on its own after this much quiet following speech… */
const SILENCE_MS = 1800;
/** …or if nothing is said at all, or the note runs long. */
const NO_SPEECH_MS = 9000;
const MAX_MS = 30_000;
const SPEECH_LEVEL = 0.08;

const noop = () => () => {};
function canRecord() {
  return !!navigator.mediaDevices && (typeof MediaRecorder !== "undefined" || !!getSR());
}

/**
 * Voice input. Always records the mic, and also runs the browser's own speech
 * recognition where it exists for live words-as-you-speak. Many Chromium
 * browsers (Brave, Arc, Electron apps, some Edge setups) expose that API but it
 * fails with a "network" error, so when it errors or hears nothing the
 * recording goes to an audio model instead. Stops itself after a pause.
 */
export function useVoice({ lang, onFinal }: { lang: "en-IN" | "hi-IN"; onFinal: (text: string) => void }) {
  const [state, setState] = useState<State>("idle");
  const [interim, setInterim] = useState("");
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [error, setError] = useState<string | null>(null);
  const supported = useSyncExternalStore(noop, canRecord, () => true);

  const recRef = useRef<SR | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const srDoneRef = useRef<Promise<void>>(Promise.resolve());
  const stoppingRef = useRef(false);
  const stopRef = useRef<() => void>(() => {});
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setLevels(Array(BARS).fill(0));
  }, []);

  const startMeter = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    streamRef.current = stream;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 128;
    an.smoothingTimeConstant = 0.72;
    src.connect(an);
    // A scrolling loudness trace, newest on the right — like a voice note.
    const buf = new Uint8Array(an.fftSize);
    let trace: number[] = Array(BARS).fill(0);
    let frame = 0;
    const began = performance.now();
    let spoke = false;
    let lastLoud = began;
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (frame++ % 3) return;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
      trace = [...trace.slice(1), level];
      setLevels(trace);
      const now = performance.now();
      if (level > SPEECH_LEVEL) {
        spoke = true;
        lastLoud = now;
      }
      if (spoke ? now - lastLoud > SILENCE_MS : now - began > NO_SPEECH_MS) stopRef.current();
      else if (now - began > MAX_MS) stopRef.current();
    };
    tick();
    return stream;
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    setState("transcribing");
    try {
      const wav = await toWav(blob);
      const r = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: wav }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't transcribe that.");
      if (j.text) onFinalRef.current(j.text);
      else setError("Didn't catch that — try again a little closer to the mic.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setState("idle");
    }
  }, []);

  /** Stop listening, then use the live transcript if there is one, else send the recording. */
  const stop = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    cancelAnimationFrame(rafRef.current);
    recRef.current?.stop();
    const mr = mediaRef.current;
    const recorded = new Promise<Blob | null>((resolve) => {
      if (!mr || mr.state === "inactive") return resolve(null);
      mr.onstop = () => resolve(new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" }));
      mr.stop();
    });
    // The recognizer can take a moment to hand over its last words.
    const settled = Promise.race([srDoneRef.current, new Promise<void>((r) => setTimeout(r, 1500))]);
    Promise.all([recorded, settled]).then(([blob]) => {
      stopMeter();
      recRef.current = null;
      mediaRef.current = null;
      setInterim("");
      const text = (finalRef.current || interimRef.current).trim();
      if (text) {
        setState("idle");
        onFinalRef.current(text);
      } else if (blob && blob.size > 1200) {
        transcribe(blob);
      } else {
        setState("idle");
        setError("Didn't hear anything — tap the mic and speak.");
      }
    });
  }, [stopMeter, transcribe]);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    setError(null);
    setInterim("");
    finalRef.current = "";
    interimRef.current = "";
    stoppingRef.current = false;
    let stream: MediaStream;
    try {
      stream = await startMeter();
    } catch (e) {
      stopMeter();
      setState("idle");
      setError(
        (e as DOMException)?.name === "NotFoundError"
          ? "No microphone found. Plug one in, or type instead."
          : "The microphone is blocked. Allow it from the icon in the address bar, or type instead.",
      );
      return;
    }

    if (typeof MediaRecorder !== "undefined") {
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mediaRef.current = mr;
      mr.start(250);
    }

    srDoneRef.current = Promise.resolve();
    const SRC = getSR();
    if (SRC) {
      try {
        const rec = new SRC();
        rec.lang = lang;
        rec.interimResults = true;
        rec.continuous = true;
        rec.maxAlternatives = 1;
        rec.onresult = (e) => {
          let fin = "";
          let inter = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) fin += r[0].transcript;
            else inter += r[0].transcript;
          }
          finalRef.current += fin;
          interimRef.current = inter;
          setInterim((finalRef.current + " " + inter).trim());
        };
        let ended: () => void = () => {};
        srDoneRef.current = new Promise<void>((r) => (ended = r));
        // Its errors (network, not-allowed, …) don't matter: the recording is the fallback.
        rec.onerror = () => {};
        rec.onend = () => ended();
        recRef.current = rec;
        rec.start();
      } catch {
        recRef.current = null;
        srDoneRef.current = Promise.resolve();
      }
    }

    if (!mediaRef.current && !recRef.current) {
      stopMeter();
      setError("Voice isn't available in this browser. Type instead.");
      return;
    }
    setState("listening");
  }, [lang, startMeter, stopMeter]);

  useEffect(
    () => () => {
      recRef.current?.abort();
      if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
      stopMeter();
    },
    [stopMeter],
  );

  return { state, interim, levels, error, supported, start, stop, clearError: () => setError(null) };
}

/** Decode any recorded audio, downmix to 16 kHz mono and wrap it as base64 WAV. */
async function toWav(blob: Blob): Promise<string> {
  const ab = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const audio = await ctx.decodeAudioData(ab);
  await ctx.close();
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(audio.duration * rate), rate);
  const src = offline.createBufferSource();
  src.buffer = audio;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  const pcm = rendered.getChannelData(0);
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let bin = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
