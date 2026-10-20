// The Saakh data lake: an append-only, hash-chained event log (JSON Lines).
//
// Nothing is ever updated in place. Every fact — a business joining, a slip
// raised, a confirmation, a payment, a penalty — is an event. Each event
// carries the hash of the one before it, so any tampering with history breaks
// the chain and `verifyChain()` reports exactly where.
//
// The log lives in one of two places. With DATABASE_URL (or POSTGRES_URL) set
// it's in Postgres — Supabase, say — so every server instance shares one
// ledger, which a serverless host like Vercel needs. Without it, it's a file
// on disk. Reads are synchronous over an in-memory copy: call `openLake()` at
// the start of a request to bring that copy up to date. Writes are async.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import postgres from "postgres";
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

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

const DATA_DIR =
  process.env.SAAKH_DATA_DIR ?? (process.env.VERCEL ? "/tmp/saakh" : path.join(process.cwd(), ".data"));
const LAKE_FILE = path.join(DATA_DIR, "lake.jsonl");
const RUNS_FILE = path.join(DATA_DIR, "agent-runs.jsonl");
const CLOCK_FILE = path.join(DATA_DIR, "clock.json");

export const GENESIS = "0".repeat(64);

type Cache = { mtime: number; size: number; events: LakeEvent[] };
/** The in-memory copy of the Postgres lake, refreshed by `openLake()`. */
type Mirror = { epoch: string; events: LakeEvent[]; simDay: string | null; patrolDay: string | null };
const g = globalThis as unknown as {
  __saakhLake?: Cache;
  __saakhRuns?: { mtime: number; size: number; runs: AgentRun[] };
  __saakhSql?: postgres.Sql;
  __saakhSchema?: Promise<unknown>;
  __saakhMirror?: Mirror;
};

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

/** A late month is assessed once, even if two patrols race each other. */
function dropRepeats(events: LakeEvent[], drafts: EventDraft[]) {
  if (!drafts.some((d) => d.type === "penalty.assessed")) return drafts;
  const key = (d: { data: Record<string, unknown> }) => `${d.data.slipId}:${d.data.month}`;
  const done = new Set(events.filter((e) => e.type === "penalty.assessed").map(key));
  return drafts.filter((d) => d.type !== "penalty.assessed" || !done.has(key(d)));
}

// ---- Postgres ----

const LOCK = 7_240_501; // advisory lock: one writer at a time, across all instances

function sql() {
  return (g.__saakhSql ??= postgres(DB_URL, {
    prepare: false, // Supabase's transaction pooler can't keep prepared statements
    max: 3,
    idle_timeout: 20,
    ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) ? false : "require",
    onnotice: () => {},
  }));
}

// Its own schema, with row-level security on and no policies, so Supabase's
// public REST API can't reach the ledger. The server connects as the owner.
const SCHEMA = `
  create schema if not exists saakh;
  create table if not exists saakh.events (seq bigint primary key, hash text not null, line text not null);
  create table if not exists saakh.runs (id text primary key, started_at text not null, line text not null);
  create table if not exists saakh.meta (id int primary key check (id = 1), epoch text not null, sim_day text, patrol_day text);
  alter table saakh.events enable row level security;
  alter table saakh.runs enable row level security;
  alter table saakh.meta enable row level security;
`;

function ensureSchema() {
  return (g.__saakhSchema ??= sql().unsafe(SCHEMA).simple().catch((e) => {
    g.__saakhSchema = undefined;
    throw e;
  }));
}

type Q = postgres.Sql | postgres.TransactionSql;

/** Bring the mirror up to date: only events it hasn't seen, unless the lake was reset. */
async function pull(q: Q): Promise<Mirror | null> {
  const m = g.__saakhMirror;
  const since = m?.events.at(-1)?.seq ?? 0;
  const [metas, rows] = await Promise.all([
    q<{ epoch: string; sim_day: string | null; patrol_day: string | null }[]>`select epoch, sim_day, patrol_day from saakh.meta where id = 1`,
    q<{ line: string }[]>`select line from saakh.events where seq > ${since} order by seq`,
  ]);
  const meta = metas[0];
  if (!meta) return null;
  let events: LakeEvent[];
  if (m && m.epoch === meta.epoch) {
    events = rows.length ? [...m.events, ...rows.map((r) => JSON.parse(r.line) as LakeEvent)] : m.events;
  } else {
    const all = await q<{ line: string }[]>`select line from saakh.events order by seq`;
    events = all.map((r) => JSON.parse(r.line) as LakeEvent);
  }
  return (g.__saakhMirror = { epoch: meta.epoch, events, simDay: meta.sim_day, patrolDay: meta.patrol_day });
}

function mirror(): Mirror {
  if (!g.__saakhMirror) throw new Error("Call openLake() before reading the lake.");
  return g.__saakhMirror;
}

/** Replaces everything with a fresh demo market. Call inside a locked transaction. */
async function writeSeed(tx: postgres.TransactionSql) {
  g.__saakhMirror = undefined;
  const seed = buildSeed(new Date());
  const events = chain(seed.events, GENESIS, 0);
  await tx`delete from saakh.events`;
  await tx`delete from saakh.runs`;
  for (let i = 0; i < events.length; i += 500) {
    const rows = events.slice(i, i + 500).map((e) => ({ seq: e.seq, hash: e.hash, line: JSON.stringify(e) }));
    await tx`insert into saakh.events ${tx(rows, "seq", "hash", "line")}`;
  }
  if (seed.runs.length) {
    const rows = seed.runs.map((r) => ({ id: r.id, started_at: r.startedAt, line: JSON.stringify(r) }));
    await tx`insert into saakh.runs ${tx(rows, "id", "started_at", "line")}`;
  }
  const epoch = crypto.randomBytes(6).toString("hex");
  await tx`
    insert into saakh.meta (id, epoch, sim_day, patrol_day) values (1, ${epoch}, null, null)
    on conflict (id) do update set epoch = excluded.epoch, sim_day = null, patrol_day = null`;
}

// ---- The lake ----

/** Makes the lake ready to read: creates and seeds it on first use, then catches up. */
export async function openLake() {
  if (!DB_URL) {
    ensureSeeded();
    return;
  }
  await ensureSchema();
  if (await pull(sql())) return;
  await sql().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK})`;
    const [meta] = await tx`select 1 from saakh.meta where id = 1`;
    if (!meta) await writeSeed(tx);
  });
  await pull(sql());
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
  if (DB_URL) return mirror().events;
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

export async function appendEvents(drafts: EventDraft[]): Promise<LakeEvent[]> {
  if (!drafts.length) return [];
  if (!DB_URL) {
    const events = readLake();
    const last = events[events.length - 1];
    const out = chain(dropRepeats(events, drafts), last ? last.hash : GENESIS, last ? last.seq : 0);
    if (!out.length) return [];
    fs.appendFileSync(LAKE_FILE, out.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const st = fs.statSync(LAKE_FILE);
    g.__saakhLake = { mtime: st.mtimeMs, size: st.size, events: [...events, ...out] };
    return out;
  }
  // Chain onto the true head: lock, catch up on anything other instances wrote, then insert.
  const { m, out } = await sql().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK})`;
    const m = await pull(tx);
    if (!m) throw new Error("The lake was cleared mid-write. Try again.");
    const last = m.events[m.events.length - 1];
    const out = chain(dropRepeats(m.events, drafts), last ? last.hash : GENESIS, last ? last.seq : 0);
    if (out.length) {
      const rows = out.map((e) => ({ seq: e.seq, hash: e.hash, line: JSON.stringify(e) }));
      await tx`insert into saakh.events ${tx(rows, "seq", "hash", "line")}`;
    }
    return { m, out };
  });
  if (out.length) g.__saakhMirror = { ...m, events: [...m.events, ...out] };
  return out;
}

export async function verifyChain(): Promise<{ ok: boolean; count: number; head: string; brokenAt?: number }> {
  // Re-read the stored log itself, not the in-memory copy.
  const events = DB_URL
    ? (await sql()<{ line: string }[]>`select line from saakh.events order by seq`).map((r) => JSON.parse(r.line) as LakeEvent)
    : readLake();
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

export async function readRuns(): Promise<AgentRun[]> {
  if (DB_URL) {
    const rows = await sql()<{ line: string }[]>`select line from saakh.runs order by started_at`;
    return rows.map((r) => JSON.parse(r.line) as AgentRun);
  }
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

export async function appendRun(run: AgentRun) {
  if (DB_URL) {
    await sql()`insert into saakh.runs (id, started_at, line) values (${run.id}, ${run.startedAt}, ${JSON.stringify(run)}) on conflict (id) do nothing`;
    return;
  }
  ensureSeeded();
  fs.appendFileSync(RUNS_FILE, JSON.stringify(run) + "\n");
}

// ---- The Saakh clock (time machine) ----

export function getSimDay(): string | null {
  if (DB_URL) return g.__saakhMirror?.simDay ?? null;
  try {
    const raw = JSON.parse(fs.readFileSync(CLOCK_FILE, "utf8")) as { simDay?: string | null };
    return raw.simDay ?? null;
  } catch {
    return null;
  }
}

export async function setSimDay(day: string | null) {
  if (DB_URL) {
    await sql()`update saakh.meta set sim_day = ${day} where id = 1`;
    if (g.__saakhMirror) g.__saakhMirror = { ...g.__saakhMirror, simDay: day };
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CLOCK_FILE, JSON.stringify({ simDay: day }));
}

/** Changes whenever the lake is reset, so per-instance memos can tell. */
export function lakeEpoch(): string {
  return (DB_URL && g.__saakhMirror?.epoch) || "local";
}

/**
 * Claims the patrol for a Saakh day. True for exactly one caller per day across
 * every instance; on a single disk there's only one instance, so always true.
 */
export async function claimPatrolDay(day: string): Promise<boolean> {
  if (!DB_URL) return true;
  if (g.__saakhMirror?.patrolDay === day) return false;
  const rows = await sql()`update saakh.meta set patrol_day = ${day} where id = 1 and patrol_day is distinct from ${day} returning id`;
  if (g.__saakhMirror) g.__saakhMirror = { ...g.__saakhMirror, patrolDay: day };
  return rows.length > 0;
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

export async function resetLake() {
  if (DB_URL) {
    await ensureSchema();
    await sql().begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${LOCK})`;
      await writeSeed(tx);
    });
    await pull(sql());
    return;
  }
  for (const f of [LAKE_FILE, RUNS_FILE, CLOCK_FILE]) {
    if (fs.existsSync(/*turbopackIgnore: true*/ f)) fs.rmSync(/*turbopackIgnore: true*/ f);
  }
  g.__saakhLake = undefined;
  g.__saakhRuns = undefined;
  ensureSeeded();
}
