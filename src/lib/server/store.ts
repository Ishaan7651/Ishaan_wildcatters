// The Saakh data lake: an append-only, hash-chained event log (JSON Lines).
//
// Nothing is ever updated in place. Every fact — a business joining, a slip
// raised, a confirmation, a payment, a penalty — is an event. Each event
// carries the hash of the one before it, so any tampering with history breaks
// the chain and `verifyChain()` reports exactly where.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { AgentRun } from "@/lib/shared/types";
import { istDay } from "@/lib/shared/dates";
import { buildSeed } from "./seed";

export type EventType =
  | "business.registered"
  | "slip.raised"
  | "slip.confirmed"
  | "slip.disputed"
  | "slip.counter_accepted"
  | "slip.withdrawn"
  | "payment.recorded"
  | "payment.acknowledged"
  | "payment.rejected"
  | "confirmation.requested"
  | "reminder.sent"
  | "penalty.assessed";

export interface LakeEvent<T = Record<string, unknown>> {
  seq: number;
  id: string;
  type: EventType;
  /** When it happened on the Saakh clock (moves with the time machine). */
  at: string;
  /** Wall-clock time it was written. */
  recordedAt: string;
  /** Business id, or "agent:<name>". */
  actor: string;
  data: T;
  prev: string;
  hash: string;
}

export interface EventDraft {
  type: EventType;
  actor: string;
  data: Record<string, unknown>;
  at?: string;
}

const DATA_DIR =
  process.env.SAAKH_DATA_DIR ?? (process.env.VERCEL ? "/tmp/saakh" : path.join(process.cwd(), ".data"));
const LAKE_FILE = path.join(DATA_DIR, "lake.jsonl");
const RUNS_FILE = path.join(DATA_DIR, "agent-runs.jsonl");
const CLOCK_FILE = path.join(DATA_DIR, "clock.json");

export const GENESIS = "0".repeat(64);

type Cache = { mtime: number; size: number; events: LakeEvent[] };
const g = globalThis as unknown as { __saakhLake?: Cache; __saakhRuns?: { mtime: number; size: number; runs: AgentRun[] } };

function hashOf(prev: string, e: Pick<LakeEvent, "seq" | "type" | "at" | "actor" | "data">): string {
  const body = JSON.stringify({ seq: e.seq, type: e.type, at: e.at, actor: e.actor, data: e.data });
  return crypto.createHash("sha256").update(prev + "|" + body).digest("hex");
}

function chain(drafts: EventDraft[], prevHash: string, prevSeq: number): LakeEvent[] {
  let prev = prevHash;
  let seq = prevSeq;
  const recordedAt = new Date().toISOString();
  return drafts.map((d) => {
    seq += 1;
    const base = {
      seq,
      id: `ev_${seq.toString(36)}${crypto.randomBytes(3).toString("hex")}`,
      type: d.type,
      at: d.at ?? nowISO(),
      recordedAt,
      actor: d.actor,
      data: d.data,
    };
    const hash = hashOf(prev, base);
    const ev: LakeEvent = { ...base, prev, hash };
    prev = hash;
    return ev;
  });
}

function ensureSeeded() {
  if (fs.existsSync(LAKE_FILE)) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const seed = buildSeed(new Date());
  const events = chain(seed.events, GENESIS, 0);
  fs.writeFileSync(LAKE_FILE, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  fs.writeFileSync(RUNS_FILE, seed.runs.map((r) => JSON.stringify(r)).join("\n") + "\n");
  g.__saakhLake = undefined;
  g.__saakhRuns = undefined;
}

export function readLake(): LakeEvent[] {
  ensureSeeded();
  const st = fs.statSync(LAKE_FILE);
  const c = g.__saakhLake;
  if (c && c.mtime === st.mtimeMs && c.size === st.size) return c.events;
  const events = fs
    .readFileSync(LAKE_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LakeEvent);
  g.__saakhLake = { mtime: st.mtimeMs, size: st.size, events };
  return events;
}

export function appendEvents(drafts: EventDraft[]): LakeEvent[] {
  if (!drafts.length) return [];
  const events = readLake();
  const last = events[events.length - 1];
  const out = chain(drafts, last ? last.hash : GENESIS, last ? last.seq : 0);
  fs.appendFileSync(LAKE_FILE, out.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const st = fs.statSync(LAKE_FILE);
  g.__saakhLake = { mtime: st.mtimeMs, size: st.size, events: [...events, ...out] };
  return out;
}

export function verifyChain(): { ok: boolean; count: number; head: string; brokenAt?: number } {
  const events = readLake();
  let prev = GENESIS;
  for (const e of events) {
    if (e.prev !== prev || hashOf(prev, e) !== e.hash) {
      return { ok: false, count: events.length, head: prev, brokenAt: e.seq };
    }
    prev = e.hash;
  }
  return { ok: true, count: events.length, head: prev };
}

// ---- Agent run log ----

export function readRuns(): AgentRun[] {
  ensureSeeded();
  if (!fs.existsSync(RUNS_FILE)) return [];
  const st = fs.statSync(RUNS_FILE);
  const c = g.__saakhRuns;
  if (c && c.mtime === st.mtimeMs && c.size === st.size) return c.runs;
  const runs = fs
    .readFileSync(RUNS_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as AgentRun);
  g.__saakhRuns = { mtime: st.mtimeMs, size: st.size, runs };
  return runs;
}

export function appendRun(run: AgentRun) {
  ensureSeeded();
  fs.appendFileSync(RUNS_FILE, JSON.stringify(run) + "\n");
}

// ---- The Saakh clock (time machine) ----

export function getSimDay(): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(CLOCK_FILE, "utf8")) as { simDay?: string | null };
    return raw.simDay ?? null;
  } catch {
    return null;
  }
}

export function setSimDay(day: string | null) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CLOCK_FILE, JSON.stringify({ simDay: day }));
}

/** Current instant on the Saakh clock: the simulated day at today's real time-of-day. */
export function nowISO(): string {
  const sim = getSimDay();
  const real = new Date();
  if (!sim || sim === istDay(real)) return real.toISOString();
  const ist = new Date(real.getTime() + 330 * 60_000).toISOString().slice(11, 19);
  return new Date(`${sim}T${ist}+05:30`).toISOString();
}

export function today(): string {
  return istDay(nowISO());
}

export function resetLake() {
  for (const f of [LAKE_FILE, RUNS_FILE, CLOCK_FILE]) {
    if (fs.existsSync(/*turbopackIgnore: true*/ f)) fs.rmSync(/*turbopackIgnore: true*/ f);
  }
  g.__saakhLake = undefined;
  g.__saakhRuns = undefined;
  ensureSeeded();
}
