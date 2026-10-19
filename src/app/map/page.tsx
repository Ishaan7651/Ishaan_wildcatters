"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { ArrowUpRight } from "lucide-react";
import { rupees, rupeesShort } from "@/lib/shared/money";
import { useNetwork, type NetLink, type NetNode } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { ScoreRing } from "@/components/score/ScoreRing";
import { BAND_COLOR, ScoreChip } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/PageHeader";

type N = NetNode & SimulationNodeDatum & { r: number; gx: number; gy: number };
type L = Omit<NetLink, "source" | "target"> & SimulationLinkDatum<N> & { source: N | string; target: N | string };

const W = 960;
const H = 760;
// India's trading towns, roughly placed: longitude → x, latitude → y
const gx = (lng: number) => 90 + ((lng - 71.5) / (90 - 71.5)) * (W - 180);
const gy = (lat: number) => 60 + ((31.5 - lat) / (31.5 - 8.5)) * (H - 130);

// Where each business last settled, so refreshes don't make the map jump.
const POSITIONS = new Map<string, { x: number; y: number }>();

export default function MapPage() {
  const { data } = useNetwork();
  const { actorId } = useApp();
  const [mode, setMode] = useState<"geo" | "web">("geo");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [, setFrame] = useState(0);

  const graph = useMemo(() => {
    if (!data) return { nodes: [] as N[], links: [] as L[] };
    const nodes: N[] = data.nodes.map((n) => {
      const vol = n.owes.amount + n.owed.amount;
      const p = POSITIONS.get(n.id);
      const r = 15 + Math.min(17, Math.sqrt(vol) / 28);
      return { ...n, r, gx: gx(n.lng), gy: gy(n.lat), x: p?.x ?? gx(n.lng), y: p?.y ?? gy(n.lat) };
    });
    return { nodes, links: data.links.map((l) => ({ ...l }) as L) };
  }, [data]);

  useEffect(() => {
    const { nodes, links } = graph;
    if (!nodes.length) return;
    const geo = mode === "geo";
    const sim = forceSimulation<N>(nodes)
      .force("link", forceLink<N, L>(links).id((d) => d.id).distance(geo ? 80 : 170).strength(geo ? 0.03 : 0.3))
      .force("charge", forceManyBody<N>().strength(geo ? -160 : -700))
      .force("x", forceX<N>((d) => (geo ? d.gx : W / 2)).strength(geo ? 0.32 : 0.05))
      .force("y", forceY<N>((d) => (geo ? d.gy : H / 2)).strength(geo ? 0.32 : 0.08))
      .force("collide", forceCollide<N>((d) => d.r + 34).strength(0.9))
      .alpha(POSITIONS.size ? 0.5 : 1)
      .alphaDecay(0.045)
      .on("tick", () => {
        for (const n of nodes) POSITIONS.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
        setFrame((f) => f + 1);
      });
    return () => {
      sim.stop();
    };
  }, [graph, mode]);

  const nodes = graph.nodes;
  const links = graph.links.filter((l) => (onlyOverdue ? l.overdue > 0 : showPaid || l.open > 0 || l.awaiting > 0));
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const focus = hover ?? selected;
  const touches = (l: L, id: string) => (l.source as N).id === id || (l.target as N).id === id;

  const insights = useMemo(() => {
    if (!data) return [];
    const nm = (id: string) => data.nodes.find((n) => n.id === id)?.name ?? id;
    const worst = [...data.links].filter((l) => l.overdue > 0).sort((a, b) => b.overdue - a.overdue)[0];
    const exposed = [...data.nodes].sort((a, b) => b.owed.overdueAmount - a.owed.overdueAmount)[0];
    const totalOverdue = data.links.reduce((a, l) => a + l.overdue, 0);
    const out: string[] = [`${rupees(totalOverdue)} is overdue across the market right now.`];
    if (worst) out.push(`Biggest late debt: ${nm(worst.source)} → ${nm(worst.target)}, ${rupees(worst.overdue)}.`);
    if (exposed?.owed.overdueAmount) out.push(`${exposed.name} is waiting on the most late money: ${rupees(exposed.owed.overdueAmount)}.`);
    return out;
  }, [data]);

  const sel = selected ? byId.get(selected) : null;

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Trust map" hindi="नक्शा">
        Who owes whom across the market. Arrows run from the borrower to the lender; red ones are overdue and the dashes flow toward whoever is waiting.
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="seg" role="tablist" aria-label="Layout">
          {(
            [
              ["geo", "By city"],
              ["web", "By connection"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}>
              {l}
            </button>
          ))}
        </div>
        <label className={clsx("flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13.5px] transition-colors", onlyOverdue ? "border-stamp/40 bg-stamp-soft text-stamp" : "border-rule bg-sheet text-ink-2 hover:border-rule-2")}>
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} className="size-4 accent-[var(--stamp)]" />
          Only overdue
        </label>
        <label className={clsx("flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13.5px] transition-colors", showPaid ? "border-mor/40 bg-mor-soft text-mor-ink" : "border-rule bg-sheet text-ink-2 hover:border-rule-2")}>
          <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} className="size-4 accent-[var(--mor)]" />
          Show paid-off history
        </label>
        <div className="ml-auto hidden flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3 md:flex">
          <Legend color="var(--stamp)" label="Overdue" dash />
          <Legend color="color-mix(in oklab, var(--mor) 55%, transparent)" label="Open, not yet due" />
          <Legend color="var(--rule-2)" label="Paid off" />
        </div>
      </div>

      <ul className="mb-4 grid gap-2 md:grid-cols-3">
        {insights.map((t) => (
          <li key={t} className="flex gap-3 rounded-2xl border border-stamp/20 bg-sheet px-4 py-3 text-[13.5px] leading-snug text-ink-2">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-stamp-soft text-[12px] font-bold text-stamp">!</span>
            {t}
          </li>
        ))}
      </ul>

      <div className="sheet relative overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-none select-none" role="img" aria-label="Network of debts between businesses">
          <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="var(--rule)" strokeWidth="0.6" />
              </pattern>
              {(["over", "open", "paid"] as const).map((k) => (
                <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={k === "over" ? "var(--stamp)" : k === "open" ? "var(--mor)" : "var(--rule-2)"} />
                </marker>
              ))}
            </defs>
            <rect width={W} height={H} fill="url(#grid)" opacity={0.7} />
            {mode === "geo" && <text x={30} y={H - 24} className="fill-ink-4" style={{ font: "500 13px var(--font-hind)" }}>Laid out roughly by city — north at the top</text>}

            {links.map((l, i) => {
              const s = l.source as N;
              const t = l.target as N;
              if (s.x == null || t.x == null) return null;
              const dx = t.x - s.x!;
              const dy = t.y! - s.y!;
              const d = Math.hypot(dx, dy) || 1;
              const ux = dx / d;
              const uy = dy / d;
              const x1 = s.x! + ux * (s.r + 3);
              const y1 = s.y! + uy * (s.r + 3);
              const x2 = t.x! - ux * (t.r + 6);
              const y2 = t.y! - uy * (t.r + 6);
              const mx = (x1 + x2) / 2 - uy * d * 0.12;
              const my = (y1 + y2) / 2 + ux * d * 0.12;
              const kind = l.overdue > 0 ? "over" : l.open > 0 ? "open" : "paid";
              const dim = focus && !touches(l, focus);
              const w = kind === "paid" ? 1.2 : 1.5 + Math.min(5, Math.sqrt((kind === "over" ? l.overdue : l.open) / 4000));
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
                  fill="none"
                  stroke={kind === "over" ? "var(--stamp)" : kind === "open" ? "color-mix(in oklab, var(--mor) 55%, transparent)" : "var(--rule-2)"}
                  strokeWidth={w}
                  strokeDasharray={kind === "over" ? "7 5" : kind === "paid" ? "3 4" : undefined}
                  markerEnd={`url(#arrow-${kind})`}
                  opacity={dim ? 0.12 : 1}
                  style={kind === "over" ? { animation: "march 0.9s linear infinite" } : undefined}
                />
              );
            })}

            {nodes.map((n) => {
              if (n.x == null) return null;
              const dim = focus && focus !== n.id && !links.some((l) => touches(l, focus) && touches(l, n.id));
              const col = BAND_COLOR[n.band];
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  opacity={dim ? 0.25 : 1}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setSelected(n.id === selected ? null : n.id)}
                  style={{ cursor: "pointer", transition: "opacity 160ms" }}
                  role="button"
                  aria-label={`${n.name}, score ${n.score}`}
                >
                  {n.id === actorId && <circle r={n.r + 7} fill="none" stroke="var(--mor)" strokeWidth={2} strokeDasharray="3 3" />}
                  {n.id === selected && <circle r={n.r + 5} fill="none" stroke="var(--ink)" strokeWidth={2} />}
                  <circle r={n.r} fill={`color-mix(in oklab, ${col} 14%, var(--sheet))`} stroke={col} strokeWidth={2} />
                  <text textAnchor="middle" dy="0.36em" fill={col} style={{ font: `700 ${Math.round(n.r * 0.85)}px var(--font-anek)`, fontStretch: "80%" }}>
                    {n.score}
                  </text>
                  <text
                    textAnchor="middle"
                    y={n.r + 17}
                    fill="var(--ink)"
                    stroke="var(--sheet)"
                    strokeWidth={4}
                    paintOrder="stroke"
                    style={{ font: "600 15px var(--font-hind)" }}
                  >
                    {n.name}
                  </text>
                  <text textAnchor="middle" y={n.r + 32} fill="var(--ink-3)" stroke="var(--sheet)" strokeWidth={4} paintOrder="stroke" style={{ font: "400 12.5px var(--font-hind)" }}>
                    {n.city}
                    {n.owes.overdueAmount ? ` · ${rupeesShort(n.owes.overdueAmount)} late` : ""}
                  </text>
                </g>
              );
            })}
          </svg>

        <div className="absolute top-3 right-3 w-[min(300px,calc(100%-24px))]">
          {sel ? (
            <div className="rounded-2xl border border-rule bg-sheet/95 p-4 shadow-[var(--shadow-lift)] backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <ScoreRing score={sel.score} band={sel.band} size={72} />
                <div className="min-w-0">
                  <p className="display truncate text-[18px] font-semibold text-ink">{sel.name}</p>
                  <p className="text-[12.5px] text-ink-3">
                    {sel.category} · {sel.city}
                  </p>
                </div>
              </div>
              <Connections title="Owes" list={graph.links.filter((l) => (l.source as N).id === sel.id && l.open > 0)} pick={(l) => l.target as N} />
              <Connections title="Is owed by" list={graph.links.filter((l) => (l.target as N).id === sel.id && l.open > 0)} pick={(l) => l.source as N} />
              <div className="mt-3 flex items-center justify-between">
                <Link href={`/b/${sel.id}`} className="flex items-center gap-1 text-[13px] font-medium text-mor hover:underline">
                  Full record <ArrowUpRight size={14} />
                </Link>
                <button onClick={() => setSelected(null)} className="text-[12px] text-ink-3 hover:text-ink">Close</button>
              </div>
            </div>
          ) : (
            <p className="ml-auto w-fit rounded-full border border-rule bg-sheet/90 px-3 py-1.5 text-[12px] text-ink-3 backdrop-blur-sm">
              Tap a circle to see its debts · the number is its score
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Connections({ title, list, pick }: { title: string; list: L[]; pick: (l: L) => N }) {
  if (!list.length) return null;
  return (
    <div className="mt-4">
      <p className="eyebrow mb-1">{title}</p>
      <ul className="space-y-1">
        {list
          .sort((a, b) => b.open - a.open)
          .map((l, i) => {
            const o = pick(l);
            return (
              <li key={i} className="flex items-center gap-2 text-[13px]">
                <ScoreChip score={o.score} band={o.band} />
                <span className="min-w-0 flex-1 truncate text-ink">{o.name}</span>
                <span className={clsx("tabular", l.overdue ? "font-semibold text-stamp" : "text-ink-2")}>{rupeesShort(l.open)}</span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

function Legend({ color, label, dash }: { color: string; label: string; dash?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="6">
        <line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="2.5" strokeDasharray={dash ? "5 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}
