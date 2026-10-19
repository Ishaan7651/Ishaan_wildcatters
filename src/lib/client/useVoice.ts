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

const noop = () => () => {};
function canRecord() {
  return !!getSR() || (!!navigator.mediaDevices && typeof MediaRecorder !== "undefined");
}

/**
 * Voice input. Uses the browser's own speech recognition where it exists
 * (Chrome, Edge, Safari) for live words-as-you-speak; elsewhere records a short
 * WAV and has an audio model transcribe it. Either way, shows a live level meter.
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
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (frame++ % 3) return;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      trace = [...trace.slice(1), Math.min(1, rms * 4.5)];
      setLevels(trace);
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

  const start = useCallback(async () => {
    setError(null);
    setInterim("");
    finalRef.current = "";
    interimRef.current = "";
    const SRC = getSR();
    try {
      const stream = await startMeter();
      if (SRC) {
        const rec = new SRC();
        rec.lang = lang;
        rec.interimResults = true;
        rec.continuous = false;
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
        rec.onerror = (e) => {
          if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("The microphone is blocked. Allow it in the address bar, or type instead.");
          else if (e.error === "no-speech") setError("Didn't hear anything — tap the mic and speak.");
          else if (e.error !== "aborted") setError(`Voice stopped (${e.error}). You can type instead.`);
        };
        rec.onend = () => {
          stopMeter();
          setState("idle");
          const text = (finalRef.current || interimRef.current).trim();
          setInterim("");
          if (text) onFinalRef.current(text);
        };
        recRef.current = rec;
        rec.start();
        setState("listening");
      } else {
        const mr = new MediaRecorder(stream);
        chunksRef.current = [];
        mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
        mr.onstop = () => {
          stopMeter();
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          transcribe(blob);
        };
        mediaRef.current = mr;
        mr.start();
        setState("listening");
      }
    } catch {
      stopMeter();
      setState("idle");
      setError("The microphone is blocked or missing. Allow it in the address bar, or type instead.");
    }
  }, [lang, startMeter, stopMeter, transcribe]);

  const stop = useCallback(() => {
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
    }
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
      mediaRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    recRef.current?.abort();
    stopMeter();
  }, [stopMeter]);

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
