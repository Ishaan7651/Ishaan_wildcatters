"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { ArrowUpRight, LoaderCircle, MapPin, Navigation, Search } from "lucide-react";
import { rupees, rupeesShort } from "@/lib/shared/money";
import { getJSON, postJSON, useNetwork, type NetNode } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { ScoreRing } from "@/components/score/ScoreRing";
import { ScoreChip } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/PageHeader";
import { GeoMap } from "@/components/map/GeoMap";
import { MarkDefs, NetworkMarks, endId, radiusFor, type Link as NetLinkDrawn } from "@/components/map/NetworkMarks";

type N = NetNode & SimulationNodeDatum & { r: number };
type L = NetLinkDrawn & SimulationLinkDatum<N>;

const W = 960;
const H = 760;

// Where each business last settled in the web layout, so refreshes don't make it jump.
const POSITIONS = new Map<string, { x: number; y: number }>();

export default function MapPage() {
  const { data, mutate } = useNetwork();
  const { actorId } = useApp();
  const [mode, setMode] = useState<"geo" | "web">("geo");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeErr, setPlaceErr] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; key: number } | null>(null);

  const nodes = useMemo(() => data?.nodes ?? [], [data]);
  const allLinks = useMemo<NetLinkDrawn[]>(() => data?.links ?? [], [data]);
  const visible = (l: NetLinkDrawn) => (onlyOverdue ? l.overdue > 0 : showPaid || l.open > 0 || l.awaiting > 0);
  const links = allLinks.filter(visible);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const focus = hover ?? selected;

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
  const select = (id: string) => {
    setPlacing(false);
    setSelected(id === selected ? null : id);
  };

  async function place(lat: number, lng: number) {
    if (!actorId) return;
    setPlacing(false);
    setPlaceErr(null);
    try {
      await postJSON(`/api/businesses/${actorId}/location`, { actorId, lat, lng });
      await mutate();
    } catch (e) {
      setPlaceErr((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Trust map" hindi="नक्शा">
        Who owes whom, where. Red is overdue.
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="seg" role="tablist" aria-label="Layout">
          {(
            [
              ["geo", "On the map"],
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
        {mode === "geo" ? (
          <GeoMap
            nodes={nodes}
            links={links}
            focus={focus}
            selected={selected}
            actorId={actorId}
            onHover={setHover}
            onSelect={select}
            onBackground={() => setSelected(null)}
            placing={placing ? place : null}
            flyTo={flyTo}
          />
        ) : (
          <Web nodes={nodes} links={allLinks} visible={visible} focus={focus} selected={selected} actorId={actorId} onHover={setHover} onSelect={select} />
        )}

        {mode === "geo" && !!data?.locating && (
          <p className="absolute top-3 left-3 flex items-center gap-2 rounded-full border border-rule bg-sheet/95 px-3 py-1.5 text-[12px] text-ink-2 shadow-[var(--shadow-sheet)]">
            <LoaderCircle size={13} className="animate-spin text-mor" />
            Finding {data.locating} {data.locating === 1 ? "shop" : "shops"} on OpenStreetMap…
          </p>
        )}
        {placeErr && !placing && (
          <p role="alert" className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-stamp px-4 py-2 text-[13px] font-medium text-sheet shadow-[var(--shadow-lift)]">
            {placeErr}
          </p>
        )}
        {placing && (
          <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-sheet shadow-[var(--shadow-lift)]">
            Tap the map where your shop is
          </p>
        )}

        <div className="absolute top-3 right-3 w-[min(310px,calc(100%-24px))]">
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
              <Where node={sel} onFly={() => setFlyTo({ lat: sel.lat, lng: sel.lng, key: Date.now() })} canFly={mode === "geo"} />
              {sel.id === actorId && mode === "geo" && (
                <PlaceMine
                  placing={placing}
                  onTapMode={() => setPlacing((p) => !p)}
                  onFound={async (lat, lng) => {
                    await place(lat, lng);
                    setFlyTo({ lat, lng, key: Date.now() });
                  }}
                />
              )}
              <Connections title="Owes" list={allLinks.filter((l) => endId(l.source) === sel.id && l.open > 0)} pick={(l) => byId.get(endId(l.target))} />
              <Connections title="Is owed by" list={allLinks.filter((l) => endId(l.target) === sel.id && l.open > 0)} pick={(l) => byId.get(endId(l.source))} />
              <div className="mt-3 flex items-center justify-between">
                <Link href={`/b/${sel.id}`} className="flex items-center gap-1 text-[13px] font-medium text-mor hover:underline">
                  Full record <ArrowUpRight size={14} />
                </Link>
                <button onClick={() => setSelected(null)} className="text-[12px] text-ink-3 hover:text-ink">
                  Close
                </button>
              </div>
            </div>
          ) : (
            <p className="ml-auto w-fit rounded-full border border-rule bg-sheet/90 px-3 py-1.5 text-[12px] text-ink-3 backdrop-blur-sm">Tap a circle</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The force-directed layout: businesses grouped by who they deal with, not where they are. */
function Web({ nodes: source, links: all, visible, ...rest }: { nodes: NetNode[]; links: NetLinkDrawn[]; visible: (l: NetLinkDrawn) => boolean; focus: string | null; selected: string | null; actorId: string | null; onHover: (id: string | null) => void; onSelect: (id: string) => void }) {
  const [, setFrame] = useState(0);
  const graph = useMemo(() => {
    const nodes: N[] = source.map((n) => {
      const p = POSITIONS.get(n.id);
      // Start from a rough map of India, so the web unfolds from where the shops are.
      return { ...n, r: radiusFor(n), x: p?.x ?? 90 + ((n.lng - 71.5) / 18.5) * (W - 180), y: p?.y ?? 60 + ((31.5 - n.lat) / 23) * (H - 130) };
    });
    const ids = new Set(nodes.map((n) => n.id));
    const links = all.filter((l) => ids.has(endId(l.source)) && ids.has(endId(l.target))).map((l) => ({ ...l, source: endId(l.source), target: endId(l.target) }) as L);
    return { nodes, links };
  }, [source, all]);

  useEffect(() => {
    const { nodes, links } = graph;
    if (!nodes.length) return;
    const sim = forceSimulation<N>(nodes)
      .force("link", forceLink<N, L>(links).id((d) => d.id).distance(170).strength(0.3))
      .force("charge", forceManyBody<N>().strength(-700))
      .force("x", forceX<N>(W / 2).strength(0.05))
      .force("y", forceY<N>(H / 2).strength(0.08))
      .force("collide", forceCollide<N>((d) => d.r + 34).strength(0.9))
      .alpha(POSITIONS.size ? 0.4 : 1)
      .alphaDecay(0.045)
      .on("tick", () => {
        for (const n of nodes) POSITIONS.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
        setFrame((f) => f + 1);
      });
    return () => {
      sim.stop();
    };
  }, [graph]);

  const marks = graph.nodes.filter((n) => n.x != null).map((n) => ({ node: n, x: n.x!, y: n.y!, r: n.r }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-none select-none" role="img" aria-label="Network of debts between businesses">
      <MarkDefs />
      <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
        <path d="M 50 0 L 0 0 0 50" fill="none" stroke="var(--rule)" strokeWidth="0.6" />
      </pattern>
      <rect width={W} height={H} fill="url(#grid)" opacity={0.7} />
      <NetworkMarks marks={marks} links={graph.links.filter(visible)} {...rest} />
    </svg>
  );
}

function Where({ node, onFly, canFly }: { node: NetNode; onFly: () => void; canFly: boolean }) {
  const loc = node.located;
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${node.lat.toFixed(6)},${node.lng.toFixed(6)}`;
  return (
    <div className="mt-3 rounded-xl bg-sheet-2 px-3 py-2.5">
      <p className="flex gap-1.5 text-[12.5px] leading-snug text-ink-2">
        <MapPin size={14} className="mt-0.5 shrink-0 text-mor" />
        <span className="line-clamp-2">{loc ? loc.address : `${node.market}, ${node.city} (finding the exact spot…)`}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        {loc && (
          <span className={clsx("rounded-full px-2 py-0.5 font-medium", loc.precision === "city" ? "bg-paper-deep text-ink-3" : "bg-mor-soft text-mor-ink")}>
            {loc.precision === "pin" ? "Pinned by owner" : loc.precision === "market" ? "Market found on OSM" : "City only"}
          </span>
        )}
        {canFly && (
          <button onClick={onFly} className="font-medium text-mor hover:underline">
            Zoom here
          </button>
        )}
        <a href={gmaps} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-mor hover:underline">
          <Navigation size={12} /> Google Maps
        </a>
      </div>
    </div>
  );
}

function PlaceMine({ placing, onTapMode, onFound }: { placing: boolean; onTapMode: () => void; onFound: (lat: number, lng: number) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="mt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setErr(null);
        try {
          const hit = await getJSON<{ lat: number; lng: number }>(`/api/geocode?q=${encodeURIComponent(q)}`);
          await onFound(hit.lat, hit.lng);
          setQ("");
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="eyebrow mb-1">Your shop&apos;s location</p>
      <div className="flex gap-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Street, market, city"
          className="min-w-0 flex-1 rounded-lg border border-rule bg-sheet px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-mor"
        />
        <button disabled={busy || q.trim().length < 3} aria-label="Find address" className="grid size-8 place-items-center rounded-lg bg-mor text-sheet disabled:opacity-40">
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Search size={14} />}
        </button>
      </div>
      {err && <p className="mt-1 text-[12px] text-stamp">{err}</p>}
      <button type="button" onClick={onTapMode} className="mt-1.5 text-[12px] font-medium text-mor hover:underline">
        {placing ? "Cancel" : "…or tap it on the map"}
      </button>
    </form>
  );
}

function Connections({ title, list, pick }: { title: string; list: NetLinkDrawn[]; pick: (l: NetLinkDrawn) => NetNode | undefined }) {
  if (!list.length) return null;
  return (
    <div className="mt-4">
      <p className="eyebrow mb-1">{title}</p>
      <ul className="space-y-1">
        {[...list]
          .sort((a, b) => b.open - a.open)
          .map((l, i) => {
            const o = pick(l);
            if (!o) return null;
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
