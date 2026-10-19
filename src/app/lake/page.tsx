"use client";

import { useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { motion } from "motion/react";
import { ChevronRight, Download, Link2, ShieldCheck, ShieldX } from "lucide-react";
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
  slip: "var(--carbon)",
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

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Events" value={data ? data.total.toLocaleString("en-IN") : "…"} sub={data?.future ? `${data.future} later on the clock` : "append-only"} />
        <Stat label="Size" value={data ? `${(data.bytes / 1024).toFixed(1)} KB` : "…"} sub="JSON Lines" />
        <Stat label="Head fingerprint" value={data?.head ? `${data.head.slice(0, 10)}…` : "…"} sub="latest event's SHA-256" mono />
        <div className="sheet flex flex-col justify-between px-4 py-3.5">
          <p className="eyebrow">Chain check</p>
          {verify === null && (
            <Button size="sm" variant="primary" className="mt-2 self-start" onClick={runVerify}>
              <ShieldCheck size={15} /> Verify every link
            </Button>
          )}
          {verify === "running" && (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-rule">
                <motion.div className="h-full bg-carbon" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 0.85, ease: "easeInOut" }} />
              </div>
              <p className="mt-1.5 text-[12px] text-ink-3">Re-hashing every event…</p>
            </div>
          )}
          {verify && verify !== "running" && (
            <button onClick={runVerify} className={clsx("mt-2 flex items-start gap-2 text-left text-[13px]", verify.ok ? "text-neem" : "text-stamp")}>
              {verify.ok ? <ShieldCheck size={18} className="shrink-0" /> : <ShieldX size={18} className="shrink-0" />}
              <span>
                <b>{verify.ok ? "Intact" : `Broken at #${verify.brokenAt}`}</b>
                <span className="block text-[11.5px] text-ink-3">
                  {verify.count} events re-hashed in {verify.ms} ms · check again
                </span>
              </span>
            </button>
          )}
        </div>
      </div>

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
                    <Link2 size={11} className={i === 0 ? "text-carbon" : ""} />
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

function Pipeline() {
  const steps = [
    { t: "You speak", d: "voice or text", g: null },
    { t: "Agents propose", d: "Sutradhar routes · Munshi, Gawah, Khoji, Dakiya", g: "sutradhar" as const },
    { t: "Rules check", d: "only the right side can confirm, pay, withdraw", g: null },
    { t: "Lake appends", d: "hash-chained event", g: null },
    { t: "Views compute", d: "scores, inbox, map — on read", g: null },
    { t: "Chowkidar patrols", d: "daily: points, reminders", g: "chowkidar" as const },
  ];
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.t} className="relative rounded-2xl border border-rule bg-sheet px-3.5 py-3">
          <span className="font-mono text-[10px] text-ink-4">step {i + 1}</span>
          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
            {s.g && <AgentGlyph agent={s.g} size={18} />}
            {s.t}
          </p>
          <p className="text-[12px] leading-snug text-ink-3">{s.d}</p>
        </li>
      ))}
    </ol>
  );
}

function Stat({ label, value, sub, mono }: { label: string; value: string; sub: string; mono?: boolean }) {
  return (
    <div className="sheet px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <p className={clsx("mt-1 text-[22px] leading-tight font-semibold text-ink", mono ? "font-mono text-[17px]" : "display")}>{value}</p>
      <p className="text-[12px] text-ink-3">{sub}</p>
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
