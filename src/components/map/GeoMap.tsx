"use client";

// The trust map on a real map of India. MapLibre draws OpenStreetMap tiles
// (served free, no key, by OpenFreeMap); the debts are an SVG layer on top,
// re-projected whenever the map moves so they stay pinned to each shop.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Crosshair, Minus, Plus } from "lucide-react";
import type { NetNode } from "@/lib/client/api";
import { MarkDefs, NetworkMarks, radiusFor, type Link, type Mark } from "./NetworkMarks";

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const INDIA: [[number, number], [number, number]] = [
  [68, 7],
  [97.5, 35.5],
];

// Labels hang below each circle, and crowded cities get spread apart, so leave room.
const FIT_PADDING = { top: 70, bottom: 110, left: 90, right: 90 };

export interface GeoMapProps {
  nodes: NetNode[];
  links: Link[];
  focus: string | null;
  selected: string | null;
  actorId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onBackground: () => void;
  /** When set, a tap on the map drops this business's pin there instead of deselecting. */
  placing?: ((lat: number, lng: number) => void) | null;
  /** Bump `key` to fly the camera to a spot. */
  flyTo?: { lat: number; lng: number; key: number } | null;
}

export function GeoMap({ nodes, links, focus, selected, actorId, onHover, onSelect, onBackground, placing, flyTo }: GeoMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MLMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [, setFrame] = useState(0);
  const fitted = useRef(false);
  const tap = useRef({ placing, onBackground });
  useEffect(() => {
    tap.current = { placing, onBackground };
  });

  useEffect(() => {
    let m: MLMap | null = null;
    let gone = false;
    (async () => {
      const ml = (await import("maplibre-gl")).default;
      if (gone || !box.current) return;
      m = new ml.Map({
        container: box.current,
        style: STYLE,
        bounds: INDIA,
        fitBoundsOptions: { padding: 30 },
        minZoom: 3.2,
        maxZoom: 17,
        maxBounds: [
          [55, -2],
          [110, 42],
        ],
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        cooperativeGestures: false,
      });
      m.touchZoomRotate.disableRotation();
      // Draw the businesses as soon as the style is in; tiles can stream in underneath.
      m.once("style.load", () => {
        if (!m) return;
        tint(m);
        setMap(m);
      });
      m.on("resize", () => setFrame((f) => f + 1));
      m.on("error", (e) => {
        // A missing tile now and then is fine; losing the style means no map at all.
        if (!m?.isStyleLoaded() && /style/i.test(String(e.error?.message))) setFailed(true);
      });
      m.on("move", () => setFrame((f) => f + 1));
      m.on("click", (e) => {
        if (tap.current.placing) tap.current.placing(e.lngLat.lat, e.lngLat.lng);
        else tap.current.onBackground();
      });
    })().catch(() => setFailed(true));
    return () => {
      gone = true;
      m?.remove();
    };
  }, []);

  // Frame every business once we know where they are.
  useEffect(() => {
    if (!map || !nodes.length || fitted.current) return;
    fitted.current = true;
    const lng = nodes.map((n) => n.lng);
    const lat = nodes.map((n) => n.lat);
    map.fitBounds(
      [
        [Math.min(...lng), Math.min(...lat)],
        [Math.max(...lng), Math.max(...lat)],
      ],
      { padding: FIT_PADDING, duration: 0, maxZoom: 9 },
    );
  }, [map, nodes]);

  useEffect(() => {
    if (map && flyTo) map.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: Math.max(map.getZoom(), 12), duration: 1400 });
  }, [map, flyTo]);

  useEffect(() => {
    if (map) map.getCanvas().style.cursor = placing ? "crosshair" : "";
  }, [map, placing]);

  const marks = map ? layout(map, nodes, [focus, selected]) : [];
  const size = map ? { w: map.getContainer().clientWidth, h: map.getContainer().clientHeight } : { w: 0, h: 0 };
  const hasLocated = useMemo(() => nodes.some((n) => n.located), [nodes]);

  return (
    <div className="relative h-[min(78vh,760px)] min-h-[460px] w-full bg-paper-deep">
      {/* MapLibre makes its container position: relative, so size it by filling the parent instead. */}
      <div ref={box} className="h-full w-full" aria-label="Map of businesses and their debts" />
      {map && (
        <svg width={size.w} height={size.h} className="pointer-events-none absolute inset-0 select-none" role="img" aria-label="Debts between businesses">
          <MarkDefs />
          <NetworkMarks marks={marks} links={links} focus={focus} selected={selected} actorId={actorId} onHover={onHover} onSelect={onSelect} />
        </svg>
      )}
      {!map && !failed && <p className="absolute inset-0 grid place-items-center text-[13px] text-ink-3">Loading the map…</p>}
      {failed && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-[13.5px] text-ink-2">
          The map tiles didn&apos;t load. Check the connection, or use “By connection” above.
        </p>
      )}
      {map && (
        <div className="absolute bottom-8 left-3 flex flex-col overflow-hidden rounded-xl border border-rule bg-sheet/95 shadow-[var(--shadow-sheet)]">
          <MapButton label="Zoom in" onClick={() => map.zoomIn()}>
            <Plus size={16} />
          </MapButton>
          <MapButton label="Zoom out" onClick={() => map.zoomOut()}>
            <Minus size={16} />
          </MapButton>
          <MapButton
            label="Show every business"
            onClick={() => {
              const lng = nodes.map((n) => n.lng);
              const lat = nodes.map((n) => n.lat);
              map.fitBounds(
                [
                  [Math.min(...lng), Math.min(...lat)],
                  [Math.max(...lng), Math.max(...lat)],
                ],
                { padding: FIT_PADDING, maxZoom: 9 },
              );
            }}
          >
            <Crosshair size={16} />
          </MapButton>
        </div>
      )}
      {map && hasLocated && (
        <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-ink-3">Pins geocoded with OpenStreetMap</p>
      )}
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="grid size-9 place-items-center border-b border-rule text-ink-2 last:border-b-0 hover:bg-sheet-2 hover:text-ink">
      {children}
    </button>
  );
}

/** Repaints the basemap in Saakh's paper-and-peacock colours. */
function tint(m: MLMap) {
  for (const l of m.getStyle().layers ?? []) {
    try {
      if (l.type === "background") m.setPaintProperty(l.id, "background-color", "#edf3f1");
      else if (l.type === "fill" && /water/.test(l.id)) m.setPaintProperty(l.id, "fill-color", "#bfe0d9");
      else if (l.type === "line" && /water|river/.test(l.id)) m.setPaintProperty(l.id, "line-color", "#bfe0d9");
      else if (l.type === "line" && /boundary/.test(l.id)) m.setPaintProperty(l.id, "line-color", "#9fb5af");
      // Place names stay readable but step back behind the businesses.
      else if (l.type === "symbol") m.setPaintProperty(l.id, "text-opacity", 0.55);
    } catch {
      // A layer we can't restyle keeps its default look.
    }
  }
}

/**
 * Projects each business onto the screen, nudges apart circles that would sit
 * on top of each other (two shops in one city), and names as many as fit
 * without overlapping, most important first. A nudged circle keeps a thin
 * line back to its true spot; an unnamed one shows its name on hover.
 */
function layout(map: MLMap, nodes: NetNode[], first: (string | null)[]): Mark[] {
  const z = map.getZoom();
  const scale = Math.min(1, Math.max(0.62, 0.62 + (z - 4) * 0.12));
  const items = nodes.map((n) => {
    const p = map.project([n.lng, n.lat]);
    return { node: n, x: p.x, y: p.y, ax: p.x, ay: p.y, r: radiusFor(n) * scale, label: false as Mark["label"] };
  });

  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const min = a.r + b.r + 4;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 0.01) [dx, dy, d] = [Math.cos(i + j), Math.sin(i + j), 1];
        const push = (min - d) / 2 + 0.25;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  type Box = [number, number, number, number];
  const hit = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const { clientWidth: W, clientHeight: H } = map.getContainer();
  const inside = (b: Box) => b[0] >= 0 && b[1] >= 0 && b[2] <= W && b[3] <= H;
  const taken: Box[] = items.map((m) => [m.x - m.r, m.y - m.r, m.x + m.r, m.y + m.r]);
  const rank = (m: (typeof items)[number]) => {
    const k = first.indexOf(m.node.id);
    return k >= 0 ? -1000 + k : -m.r;
  };
  for (const m of [...items].sort((a, b) => rank(a) - rank(b))) {
    const w = Math.max(m.node.name.length * 7.6, (m.node.city.length + (m.node.owes.overdueAmount ? 12 : 0)) * 6.4) + 6;
    // Under the circle reads best; beside it is the next best thing.
    const spots: [NonNullable<Mark["label"]>, Box][] = [
      ["below", [m.x - w / 2, m.y + m.r + 2, m.x + w / 2, m.y + m.r + 38]],
      ["right", [m.x + m.r + 3, m.y - 16, m.x + m.r + 3 + w, m.y + 20]],
      ["left", [m.x - m.r - 3 - w, m.y - 16, m.x - m.r - 3, m.y + 20]],
    ];
    const spot = spots.find(([, box]) => inside(box) && !taken.some((t) => hit(t, box))) ?? (first.includes(m.node.id) ? spots[0] : null);
    if (spot) {
      m.label = spot[0];
      taken.push(spot[1]);
    }
  }

  return items.map(({ node, x, y, ax, ay, r, label }) => ({ node, x, y, r, label, anchor: Math.hypot(x - ax, y - ay) > 4 ? { x: ax, y: ay } : undefined }));
}
