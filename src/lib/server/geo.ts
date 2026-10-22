// Finds where a business really is, using OpenStreetMap's Nominatim geocoder.
//
// A business joins with a market and a city ("Mattancherry", "Kochi"). The
// first time the map needs it, we look that up and record the answer as a
// `business.located` event, so the lake remembers where every shop is and
// why. Nominatim is free and keyless but asks for one request a second and an
// identifying User-Agent, so lookups go through a single queue and are cached.

import type { Business } from "@/lib/shared/types";
import { appendEvents, readLake } from "./store";
import { getWorld } from "./views";

export interface Place {
  lat: number;
  lng: number;
  address: string;
  /** How precise the match was: the shop's market, or only its city. */
  precision: "market" | "city";
}

const ENDPOINT = process.env.SAAKH_GEOCODER_URL || "https://nominatim.openstreetmap.org";
const UA = `Saakh/0.1 (shared credit ledger; ${process.env.SAAKH_PUBLIC_URL || "https://saakh.vercel.app"})`;

const g = globalThis as unknown as {
  __saakhGeo?: Map<string, Promise<Omit<Place, "precision"> | null>>;
  __saakhGeoQueue?: Promise<unknown>;
  __saakhLocating?: Promise<void>;
};
const cache = (g.__saakhGeo ??= new Map());

/** Runs one Nominatim request at a time, a little over a second apart. */
function queued<T>(job: () => Promise<T>): Promise<T> {
  const run = (g.__saakhGeoQueue ?? Promise.resolve()).then(job);
  g.__saakhGeoQueue = run.catch(() => null).then(() => new Promise((r) => setTimeout(r, 1100)));
  return run;
}

async function lookup(q: string): Promise<Omit<Place, "precision"> | null> {
  const url = `${ENDPOINT}/search?format=jsonv2&limit=1&countrycodes=in&accept-language=en&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Geocoder answered ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string; category?: string }[];
  if (!hit) return null;
  // A market is often matched through a landmark in it (a bank, a phone shop): keep the place, not the landmark.
  const landmark = /^(amenity|shop|office|building|tourism|craft|leisure|healthcare)$/.test(hit.category ?? "");
  const address = landmark ? hit.display_name.split(", ").slice(1).join(", ") : hit.display_name;
  return { lat: Number(hit.lat), lng: Number(hit.lon), address };
}

function search(q: string) {
  const key = q.toLowerCase();
  let p = cache.get(key);
  if (!p) {
    p = queued(() => lookup(q));
    // Remember answers, but let a failed request be tried again later.
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** The market if OpenStreetMap knows it, else the city. Null if neither is found or the geocoder is down. */
export async function geocode(market: string | undefined, city: string): Promise<Place | null> {
  try {
    if (market && !/invited/i.test(market)) {
      const hit = await search(`${market}, ${city}, India`);
      if (hit) return { ...hit, precision: "market" };
    }
    const hit = await search(`${city}, India`);
    return hit ? { ...hit, precision: "city" } : null;
  } catch {
    return null;
  }
}

/** Free-text search for the "set my shop's location" box. */
export async function searchPlace(q: string): Promise<Omit<Place, "precision"> | null> {
  return search(q.includes("India") ? q : `${q}, India`).catch(() => null);
}

/** The nearest address to a dropped pin. Falls back to the coordinates themselves. */
export async function reverse(lat: number, lng: number): Promise<string> {
  const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  try {
    return await queued(async () => {
      const url = `${ENDPOINT}/reverse?format=jsonv2&zoom=17&accept-language=en&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return fallback;
      const hit = (await res.json()) as { display_name?: string };
      return hit.display_name || fallback;
    });
  } catch {
    return fallback;
  }
}

export function needsLocating(b: Business) {
  return !b.located;
}

/**
 * Looks up every business the lake has no real location for yet and records
 * what it finds. Safe to call often: only one pass runs at a time per server.
 */
export function locateMissing(limit = 6): Promise<void> {
  return (g.__saakhLocating ??= (async () => {
    try {
      const todo = [...getWorld().businesses.values()].filter(needsLocating).slice(0, limit);
      const joined = new Map(readLake().filter((e) => e.type === "business.registered").map((e) => [e.data.id as string, e.at]));
      for (const b of todo) {
        const place = await geocode(b.market, b.city);
        if (!place) continue;
        // Recheck: another server may have located it while we waited.
        if (!needsLocating(getWorld().businesses.get(b.id) ?? b)) continue;
        await appendEvents([
          {
            type: "business.located",
            // Khoji, the detective, looks the shop up.
            actor: "agent:khoji",
            // Where it was when it joined, so the time machine shows it there too.
            at: joined.get(b.id),
            data: { id: b.id, lat: place.lat, lng: place.lng, address: place.address, precision: place.precision, source: "openstreetmap" },
          },
        ]);
      }
    } finally {
      g.__saakhLocating = undefined;
    }
  })());
}
