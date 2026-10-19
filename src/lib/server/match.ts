// Forgiving business-name search: "sharma ji", "Sharmaa traders", "Rakesh"
// and "Sharma Traders Delhi" should all land on the same shop.

import type { Business } from "@/lib/shared/types";
import type { World } from "./project";

const STOP = new Set([
  "and", "the", "co", "company", "store", "stores", "traders", "trading", "enterprises", "pvt", "ltd",
  "private", "limited", "sons", "bros", "brothers", "shop", "works", "supplies", "ji", "bhai", "sahab",
  "mr", "mrs", "shri", "smt", "of", "from", "to", "wale", "wala", "waale", "m/s", "ms",
]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function core(s: string): string {
  return normalize(s)
    .split(" ")
    .filter((t) => t && !STOP.has(t))
    .join(" ");
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of A) {
    total += n;
    inter += Math.min(n, B.get(g) ?? 0);
  }
  for (const n of B.values()) total += n;
  return (2 * inter) / total;
}

export function matchScore(query: string, b: Business): number {
  const q = normalize(query);
  const qc = core(query);
  if (!q) return 0;
  const names = [b.name, b.owner, b.owner.split(" ")[0], b.owner.split(" ").slice(-1)[0]];
  let best = 0;
  for (const n of names) {
    best = Math.max(best, dice(q, normalize(n)), dice(qc, core(n)));
  }
  const tokens = new Set([...core(b.name).split(" "), ...normalize(b.owner).split(" ")]);
  const qTokens = qc.split(" ").filter((t) => t.length >= 3);
  const hits = qTokens.filter((t) => tokens.has(t) || [...tokens].some((x) => x.length >= 4 && (x.startsWith(t) || t.startsWith(x)))).length;
  if (hits) best = Math.max(best, 0.55 + 0.2 * Math.min(hits, 2));
  if (qTokens.some((t) => normalize(b.city).includes(t))) best += 0.05;
  return Math.min(1, best);
}

export function searchBusinesses(world: World, query: string, limit = 5) {
  return [...world.businesses.values()]
    .map((b) => ({ b, score: matchScore(query, b) }))
    .filter((x) => x.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Scans free text for the business it most likely mentions. */
export function findMentioned(world: World, text: string, excludeId?: string) {
  const words = normalize(text).split(" ");
  let best: { b: Business; score: number } | null = null;
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n).join(" ");
      if (core(gram).length < 3) continue;
      for (const b of world.businesses.values()) {
        if (b.id === excludeId) continue;
        const s = matchScore(gram, b);
        if (!best || s > best.score) best = { b, score: s };
      }
    }
  }
  return best && best.score >= 0.62 ? best : null;
}
