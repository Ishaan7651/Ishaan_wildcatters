// Copies a local ledger (.data/lake.jsonl, agent-runs.jsonl, clock.json) into
// the Postgres database at DATABASE_URL, replacing what's there.
//
//   npm run import-lake               (refuses if the database already has a ledger)
//   npm run import-lake -- --replace  (overwrites it)
//
// The schema matches src/lib/server/store.ts. Running app instances notice the
// new epoch and reload on their next request.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import postgres from "postgres";

try {
  process.loadEnvFile(".env.local");
} catch {}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const replace = process.argv.includes("--replace");
const dir = process.env.SAAKH_DATA_DIR || ".data";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (!url) die("Set DATABASE_URL (in .env.local or the environment) to your Supabase transaction pooler string.");

const readLines = (file) =>
  fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

const events = readLines(path.join(dir, "lake.jsonl"));
const runs = readLines(path.join(dir, "agent-runs.jsonl"));
let simDay = null;
try {
  simDay = JSON.parse(fs.readFileSync(path.join(dir, "clock.json"), "utf8")).simDay ?? null;
} catch {}
if (!events.length) die(`No ledger found at ${path.join(dir, "lake.jsonl")}.`);

// Same hash as store.ts. Refuse to upload a broken chain.
const GENESIS = "0".repeat(64);
function verify(list) {
  let prev = GENESIS;
  for (const e of list) {
    const body = JSON.stringify({ seq: e.seq, type: e.type, at: e.at, actor: e.actor, data: e.data });
    const hash = crypto.createHash("sha256").update(prev + "|" + body).digest("hex");
    if (e.prev !== prev || hash !== e.hash) return { ok: false, brokenAt: e.seq };
    prev = e.hash;
  }
  return { ok: true, head: prev };
}
const local = verify(events);
if (!local.ok) die(`The local chain is broken at event ${local.brokenAt}. Not uploading.`);

const sql = postgres(url, {
  prepare: false,
  max: 1,
  ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : "require",
  onnotice: () => {},
});

try {
  await sql.unsafe(`
    create schema if not exists saakh;
    create table if not exists saakh.events (seq bigint primary key, hash text not null, line text not null);
    create table if not exists saakh.runs (id text primary key, started_at text not null, line text not null);
    create table if not exists saakh.meta (id int primary key check (id = 1), epoch text not null, sim_day text, patrol_day text);
    alter table saakh.events enable row level security;
    alter table saakh.runs enable row level security;
    alter table saakh.meta enable row level security;
  `).simple();

  const [{ n }] = await sql`select count(*)::int as n from saakh.events`;
  if (n > 0 && !replace) {
    die(`The database already has ${n} events. Run again with --replace to overwrite them with your ${events.length} local events.`);
  }

  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${7_240_501})`;
    await tx`delete from saakh.events`;
    await tx`delete from saakh.runs`;
    for (let i = 0; i < events.length; i += 500) {
      const rows = events.slice(i, i + 500).map((e) => ({ seq: e.seq, hash: e.hash, line: JSON.stringify(e) }));
      await tx`insert into saakh.events ${tx(rows, "seq", "hash", "line")}`;
    }
    for (let i = 0; i < runs.length; i += 500) {
      const rows = runs.slice(i, i + 500).map((r) => ({ id: r.id, started_at: r.startedAt, line: JSON.stringify(r) }));
      await tx`insert into saakh.runs ${tx(rows, "id", "started_at", "line")} on conflict (id) do nothing`;
    }
    const epoch = crypto.randomBytes(6).toString("hex");
    await tx`
      insert into saakh.meta (id, epoch, sim_day, patrol_day) values (1, ${epoch}, ${simDay}, null)
      on conflict (id) do update set epoch = excluded.epoch, sim_day = excluded.sim_day, patrol_day = null`;
  });

  // Read it back and check the chain survived the trip.
  const stored = (await sql`select line from saakh.events order by seq`).map((r) => JSON.parse(r.line));
  const remote = verify(stored);
  if (!remote.ok || remote.head !== local.head) die("Uploaded, but the stored chain doesn't match. Check the database.");
  console.log(`Imported ${stored.length} events and ${runs.length} agent runs${simDay ? `, clock at ${simDay}` : ""}. Chain verified.`);
} finally {
  await sql.end();
}
