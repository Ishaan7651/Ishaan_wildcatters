"use client";

// The debts-and-businesses drawing, shared by both trust map layouts: the
// real map (positions projected from latitude/longitude) and the connection
// web (positions from a force simulation). It only draws; callers place.

import { rupeesShort } from "@/lib/shared/money";
import type { NetLink, NetNode } from "@/lib/client/api";
import { BAND_COLOR } from "@/components/ui/primitives";

export interface Mark {
  node: NetNode;
  x: number;
  y: number;
  r: number;
  /** Where to write the name, if at all. Defaults to underneath. */
  label?: "below" | "right" | "left" | false;
  /** The business's true spot, when the circle had to be nudged off it to stay readable. */
  anchor?: { x: number; y: number };
}

export type Link = Omit<NetLink, "source" | "target"> & { source: string | { id: string }; target: string | { id: string } };

export const endId = (e: Link["source"]) => (typeof e === "string" ? e : e.id);

export function radiusFor(n: NetNode) {
  return 15 + Math.min(17, Math.sqrt(n.owes.amount + n.owed.amount) / 28);
}

export function MarkDefs() {
  return (
    <defs>
      {(["over", "open", "paid"] as const).map((k) => (
        <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={k === "over" ? "var(--stamp)" : k === "open" ? "var(--mor)" : "var(--rule-2)"} />
        </marker>
      ))}
    </defs>
  );
}

export function NetworkMarks({
  marks,
  links,
  focus,
  selected,
  actorId,
  onHover,
  onSelect,
  halo = "var(--sheet)",
}: {
  marks: Mark[];
  links: Link[];
  focus: string | null;
  selected: string | null;
  actorId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  /** Outline behind labels, so they read over whatever is underneath. */
  halo?: string;
}) {
  const byId = new Map(marks.map((m) => [m.node.id, m]));
  const touches = (l: Link, id: string) => endId(l.source) === id || endId(l.target) === id;

  return (
    <>
      {links.map((l) => {
        const s = byId.get(endId(l.source));
        const t = byId.get(endId(l.target));
        if (!s || !t) return null;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const x1 = s.x + ux * (s.r + 3);
        const y1 = s.y + uy * (s.r + 3);
        const x2 = t.x - ux * (t.r + 6);
        const y2 = t.y - uy * (t.r + 6);
        const mx = (x1 + x2) / 2 - uy * d * 0.12;
        const my = (y1 + y2) / 2 + ux * d * 0.12;
        const kind = l.overdue > 0 ? "over" : l.open > 0 ? "open" : "paid";
        const dim = focus && !touches(l, focus);
        const w = kind === "paid" ? 1.2 : 1.5 + Math.min(5, Math.sqrt((kind === "over" ? l.overdue : l.open) / 4000));
        return (
          <path
            key={`${s.node.id}>${t.node.id}`}
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

      {marks.map(({ node: n, x, y, r, anchor, label = "below" }) => {
        const dim = focus && focus !== n.id && !links.some((l) => touches(l, focus) && touches(l, n.id));
        const col = BAND_COLOR[n.band];
        const side = label === "right" ? 1 : label === "left" ? -1 : 0;
        const tx = side * (r + 6);
        const anchorAt = side === 1 ? "start" : side === -1 ? "end" : "middle";
        const [y1, y2] = side ? [-1, 14] : [r + 17, r + 32];
        return (
          <g key={n.id} opacity={dim ? 0.25 : 1} style={{ transition: "opacity 160ms" }}>
            {anchor && (
              <>
                <line x1={anchor.x} y1={anchor.y} x2={x} y2={y} stroke={col} strokeWidth={1.2} opacity={0.6} />
                <circle cx={anchor.x} cy={anchor.y} r={3.5} fill={col} stroke={halo} strokeWidth={1.5} />
              </>
            )}
            <g
              transform={`translate(${x},${y})`}
              onMouseEnter={() => onHover(n.id)}
              onMouseLeave={() => onHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(n.id);
              }}
              style={{ cursor: "pointer", pointerEvents: "all" }}
              role="button"
              aria-label={`${n.name}, score ${n.score}`}
            >
              {n.id === actorId && <circle r={r + 7} fill="none" stroke="var(--mor)" strokeWidth={2} strokeDasharray="3 3" />}
              {n.id === selected && <circle r={r + 5} fill="none" stroke="var(--ink)" strokeWidth={2} />}
              <circle r={r} fill={`color-mix(in oklab, ${col} 14%, var(--sheet))`} stroke={col} strokeWidth={2} />
              <text textAnchor="middle" dy="0.36em" fill={col} style={{ fontFamily: "var(--font-anek)", fontWeight: 700, fontSize: Math.round(r * 0.85), fontStretch: "80%" }}>
                {n.score}
              </text>
              {label && (
                <>
                  <text textAnchor={anchorAt} x={tx} y={y1} fill="var(--ink)" stroke={halo} strokeWidth={4} paintOrder="stroke" style={{ font: "600 15px var(--font-hind)" }}>
                    {n.name}
                  </text>
                  <text textAnchor={anchorAt} x={tx} y={y2} fill="var(--ink-3)" stroke={halo} strokeWidth={4} paintOrder="stroke" style={{ font: "400 12.5px var(--font-hind)" }}>
                    {n.city}
                    {n.owes.overdueAmount ? ` · ${rupeesShort(n.owes.overdueAmount)} late` : ""}
                  </text>
                </>
              )}
            </g>
          </g>
        );
      })}
    </>
  );
}
