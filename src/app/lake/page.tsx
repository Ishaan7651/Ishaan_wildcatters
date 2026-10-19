"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { motion } from "motion/react";
import { Check, ChevronRight, Download, Link2, ShieldCheck, ShieldX } from "lucide-react";
import type { AgentName } from "@/lib/shared/types";
import { istDay, istTime, prettyDay } from "@/lib/shared/dates";
import { getJSON } from "@/lib/client/api";
import { AgentGlyph, Avatar, Button } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/PageHeader";

interface Ev {
  seq: number;
  id: string;
  type: string;
  at: string;
  actor: string;
  data: Record<string, unknown>;
  prev: string;
  hash: string;
  summary: string;
}
interface LakeResp {
  events: Ev[];
  total: number;
  future: number;
  counts: Record<string, number>;
  head: string | null;
  bytes: number;
}

const FAMILY: Record<string, string> = {
  business: "var(--ink-2)",
  slip: "var(--mor)",
  confirmation: "var(--agent-gawah)",
  payment: "var(--neem)",
  reminder: "var(--agent-dakiya)",
  penalty: "var(--stamp)",
};

export default function LakePage() {
  const [type, setType] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  const { data } = useSWR<LakeResp>(`/api/lake?limit=${limit}${type ? `&type=${type}` : ""}`, getJSON, { refreshInterval: 8000, keepPreviousData: true });
  const [verify, setVerify] = useState<null | "running" | { ok: boolean; count: number; head: string; brokenAt?: number; ms: number }>(null);
  const [open, setOpen] = useState<number | null>(null);
  const { data: chain } = useSWR<LakeResp>("/api/lake?limit=14", getJSON, { refreshInterval: 8000, keepPreviousData: true });

  const runVerify = async () => {
    setVerify("running");
    const [r] = await Promise.all([getJSON<{ ok: boolean; count: number; head: string; brokenAt?: number; ms: number }>("/api/lake/verify"), new Promise((res) => setTimeout(res, 900))]);
    setVerify(r);
  };

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Data lake"
        hindi="भंडार"
        action={
          <a href="/api/lake/export" className="inline-flex h-10 items-center gap-2 rounded-full border border-rule-2 bg-sheet px-4 text-[14px] font-medium text-ink hover:border-ink-3">
            <Download size={16} /> Download (.jsonl)
          </a>
        }
      >
        Every fact on Saakh — a slip raised, a “yes”, a payment, a lost point — is one event in a single append-only log. Each event carries the fingerprint (SHA-256) of the one before it, so history can&apos;t be quietly rewritten. Scores, inboxes and the map are all computed from this log.
      </PageHeader>

      <Pipeline />

      <section className="sheet mt-6 overflow-hidden" aria-label="The chain">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="display text-[19px] font-bold text-ink">The chain, newest on the right</h2>
            <p className="text-[13px] text-ink-3">Every block carries the fingerprint of the block before it. Change one, and every link after it breaks.</p>
          </div>
          {verify === null || verify === "running" ? (
            <Button variant="primary" loading={verify === "running"} onClick={runVerify}>
              <ShieldCheck size={16} /> {verify === "running" ? "Re-hashing every event…" : "Verify every link"}
            </Button>
          ) : (
            <button onClick={runVerify} className={clsx("flex items-center gap-2.5 rounded-full px-4 py-2 text-left text-[13px]", verify.ok ? "bg-neem-soft text-neem" : "bg-stamp-soft text-stamp")}>
              {verify.ok ? <ShieldCheck size={20} className="shrink-0" /> : <ShieldX size={20} className="shrink-0" />}
              <span className="leading-tight">
                <b>{verify.ok ? "Chain intact" : `Broken at #${verify.brokenAt}`}</b>
                <span className="block text-[11.5px] opacity-80">
                  {verify.count} events re-hashed in {verify.ms} ms · check again
                </span>
              </span>
            </button>
          )}
        </div>
        <HashChain events={chain?.events ?? []} verify={verify} />
        <dl className="grid grid-cols-3 divide-x divide-rule border-t border-rule bg-sheet-2">
          <Stat label="Events" value={data ? data.total.toLocaleString("en-IN") : "…"} sub={data?.future ? `${data.future} later on the clock` : "append-only"} />
          <Stat label="Size" value={data ? `${(data.bytes / 1024).toFixed(1)} KB` : "…"} sub="JSON Lines" />
          <Stat label="Head fingerprint" value={data?.head ? `${data.head.slice(0, 10)}…` : "…"} sub="latest event's SHA-256" mono />
        </dl>
      </section>

      <div className="mt-8 flex flex-wrap gap-1.5">
        <Chip active={!type} onClick={() => setType(null)} label="All" n={data?.total} />
        {data &&
          Object.entries(data.counts)
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => <Chip key={t} active={type === t} onClick={() => setType(t)} label={t} n={n} color={FAMILY[t.split(".")[0]]} />)}
      </div>

      <div className="sheet mt-4 overflow-hidden">
        <div className="hidden grid-cols-[64px_120px_190px_1fr_120px] border-b border-rule bg-sheet-2 px-4 py-2.5 md:grid">
          {["#", "When", "Event", "What happened", "Fingerprint"].map((h) => (
            <span key={h} className="eyebrow !text-[10.5px]">{h}</span>
          ))}
        </div>
        <ol>
          {(data?.events ?? []).map((e, i) => {
            const fam = FAMILY[e.type.split(".")[0]] ?? "var(--ink-2)";
            const agent = e.actor.startsWith("agent:") ? (e.actor.slice(6) as AgentName) : null;
            const isOpen = open === e.seq;
            return (
              <li key={e.id} className="border-b border-rule last:border-0">
                <button onClick={() => setOpen(isOpen ? null : e.seq)} className="grid w-full grid-cols-[52px_1fr] gap-x-3 px-4 py-2.5 text-left hover:bg-sheet-2 md:grid-cols-[64px_120px_190px_1fr_120px] md:items-center" aria-expanded={isOpen}>
                  <span className="font-mono text-[12px] text-ink-3">#{e.seq}</span>
                  <span className="hidden text-[12px] text-ink-3 md:block">
                    {prettyDay(istDay(e.at), false)} · {istTime(e.at)}
                  </span>
                  <span className="col-start-2 md:col-start-auto">
                    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11.5px]" style={{ color: fam, background: `color-mix(in oklab, ${fam} 11%, transparent)` }}>
                      {e.type}
                    </span>
                  </span>
                  <span className="col-start-2 flex min-w-0 items-center gap-2 text-[13.5px] text-ink md:col-start-auto">
                    {agent ? <AgentGlyph agent={agent} size={20} /> : <Avatar id={e.actor} name={e.actor.replace(/-/g, " ")} size={20} className="!rounded-full" />}
                    <span className="truncate">{e.summary}</span>
                  </span>
                  <span className="col-start-2 flex items-center gap-1 font-mono text-[11px] text-ink-3 md:col-start-auto">
                    <Link2 size={11} className={i === 0 ? "text-mor" : ""} />
                    {e.hash.slice(0, 10)}
                    <ChevronRight size={12} className={clsx("ml-auto transition-transform", isOpen && "rotate-90")} />
                  </span>
                </button>
                {isOpen && (
                  <div className="grid gap-3 bg-paper-deep/50 px-4 py-3 md:grid-cols-2">
                    <pre className="overflow-x-auto rounded-xl bg-sheet p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">{JSON.stringify(e.data, null, 2)}</pre>
                    <div className="space-y-2 font-mono text-[11px] text-ink-3">
                      <p>
                        <span className="eyebrow block !text-[10px]">prev</span>
                        <span className="break-all">{e.prev}</span>
                      </p>
                      <p>
                        <span className="eyebrow block !text-[10px]">hash = sha256(prev | seq, type, at, actor, data)</span>
                        <span className="break-all text-ink">{e.hash}</span>
                      </p>
                      <p>
                        <span className="eyebrow block !text-[10px]">actor</span>
                        {e.actor}
                      </p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {data && data.events.length >= limit && (
          <div className="border-t border-rule p-3 text-center">
            <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 100)}>
              Show older events
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

type Verify = null | "running" | { ok: boolean; count: number; head: string; brokenAt?: number; ms: number };

/** The last few events drawn as linked blocks. Verifying walks a light along the chain. */
function HashChain({ events, verify }: { events: Ev[]; verify: Verify }) {
  const blocks = [...events].reverse();
  const scroller = useRef<HTMLDivElement>(null);
  const [scanned, setScanned] = useState(-1);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [events.length]);

  useEffect(() => {
    if (verify !== "running") return;
    let i = -1;
    const id = setInterval(() => {
      i += 1;
      setScanned(i);
      if (i >= blocks.length - 1) clearInterval(id);
    }, 800 / Math.max(1, blocks.length));
    return () => clearInterval(id);
  }, [verify, blocks.length]);

  const done = verify !== null && verify !== "running";
  const state = (e: Ev, i: number) => {
    if (done) return verify.ok || (verify.brokenAt !== undefined && e.seq < verify.brokenAt) ? "ok" : "bad";
    if (verify === "running" && i <= scanned) return "ok";
    return "idle";
  };

  if (!blocks.length) return <div className="m-5 h-32 skeleton" />;
  return (
    <div ref={scroller} className="overflow-x-auto px-5 pt-5 pb-6">
      <div className="flex w-max items-center">
        {blocks.map((e, i) => {
          const fam = FAMILY[e.type.split(".")[0]] ?? "var(--ink-2)";
          const st = state(e, i);
          return (
            <div key={e.seq} className="flex items-center">
              {i > 0 && (
                <div className="flex w-12 shrink-0 flex-col items-center gap-0.5" title={`This block's "prev" is ${e.prev.slice(0, 12)}…, the fingerprint of #${e.seq - 1}`}>
                  <Link2 size={16} className={clsx("transition-colors", st === "ok" ? "text-neem" : st === "bad" ? "text-stamp" : "text-ink-4")} />
                  <span className={clsx("h-[2px] w-full rounded-full transition-colors", st === "ok" ? "bg-neem" : st === "bad" ? "bg-stamp" : "bg-rule-2")} />
                  <span className="font-mono text-[9px] text-ink-4">{e.prev.slice(0, 5)}</span>
                </div>
              )}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, scale: verify === "running" && i === scanned ? 1.06 : 1 }}
                className={clsx(
                  "relative w-[136px] shrink-0 rounded-2xl border-2 bg-sheet p-3 transition-colors",
                  st === "ok" ? "border-neem" : st === "bad" ? "border-stamp bg-stamp-soft/40" : "border-rule",
                )}
              >
                {st === "ok" && (
                  <span className="absolute -top-2.5 -right-2.5 grid size-6 place-items-center rounded-full bg-neem text-white">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] font-semibold text-ink">#{e.seq}</span>
                  <span className="size-2.5 rounded-full" style={{ background: fam }} />
                </div>
                <p className="mt-1 truncate font-mono text-[11px]" style={{ color: fam }}>
                  {e.type}
                </p>
                <p className="mt-1 line-clamp-2 h-[30px] text-[11.5px] leading-tight text-ink-2">{e.summary}</p>
                <p className="mt-2 rounded-md bg-paper-deep px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2">{e.hash.slice(0, 12)}</p>
              </motion.div>
            </div>
          );
        })}
        <div className="ml-4 flex shrink-0 flex-col items-center gap-1 text-ink-3">
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-[10.5px] font-bold tracking-wider text-sheet">HEAD</span>
          <span className="text-[11px]">the next event links here</span>
        </div>
      </div>
    </div>
  );
}

function Pipeline() {
  const steps = [
    { t: "You speak", g: null },
    { t: "Agents propose", g: "sutradhar" as const },
    { t: "Rules check", g: null },
    { t: "Lake appends", g: null },
    { t: "Scores & inbox computed", g: null },
    { t: "Chowkidar patrols daily", g: "chowkidar" as const },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13px]" aria-label="How a fact reaches the lake">
      {steps.map((s, i) => (
        <li key={s.t} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={14} className="text-ink-4" />}
          <span className={clsx("flex items-center gap-1.5 rounded-full border px-3 py-1", i === 3 ? "border-mor/40 bg-mor-soft font-semibold text-mor-ink" : "border-rule bg-sheet text-ink-2")}>
            {s.g && <AgentGlyph agent={s.g} size={18} />}
            {s.t}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Stat({ label, value, sub, mono }: { label: string; value: string; sub: string; mono?: boolean }) {
  return (
    <div className="px-5 py-3.5">
      <dt className="eyebrow">{label}</dt>
      <dd className={clsx("mt-0.5 text-[20px] leading-tight font-semibold text-ink", mono ? "font-mono text-[15px]" : "display")}>{value}</dd>
      <dd className="text-[12px] text-ink-3">{sub}</dd>
    </div>
  );
}

function Chip({ active, onClick, label, n, color }: { active: boolean; onClick: () => void; label: string; n?: number; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx("flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[12px]", active ? "border-ink bg-ink text-sheet" : "border-rule-2 bg-sheet text-ink-2 hover:border-ink-3")}
    >
      {color && !active && <span className="size-1.5 rounded-full" style={{ background: color }} />}
      {label}
      {n !== undefined && <span className={active ? "text-sheet/70" : "text-ink-4"}>{n}</span>}
    </button>
  );
}
