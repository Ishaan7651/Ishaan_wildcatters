"use client";

import useSWR from "swr";
import type { AgentRun, AppState, BizLite, Located, Profile, SlipView } from "@/lib/shared/types";

export async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Request failed");
  return j as T;
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "Request failed");
  return j as T;
}

export type BizRow = BizLite & {
  market: string;
  invited: boolean;
  owes: { count: number; amount: number; overdueCount: number; overdueAmount: number; oldestOverdueDays: number };
  owed: { count: number; amount: number; overdueCount: number; overdueAmount: number };
};

export function useAppState(actor: string | null) {
  return useSWR<AppState>(actor ? `/api/state?actor=${actor}` : null, getJSON, { refreshInterval: 8000, keepPreviousData: true });
}

export function useBusinesses() {
  return useSWR<BizRow[]>("/api/businesses", getJSON, { refreshInterval: 15000 });
}

export function useProfile(id: string | null) {
  return useSWR<Profile>(id ? `/api/businesses/${id}` : null, getJSON, { keepPreviousData: true });
}

export function useSlips(actor: string | null) {
  return useSWR<SlipView[]>(actor ? `/api/slips?actor=${actor}` : null, getJSON, { refreshInterval: 10000 });
}

export function useSlip(id: string | null) {
  return useSWR<SlipView>(id ? `/api/slips/${id}` : null, getJSON);
}

export interface NetNode extends BizRow {
  lat: number;
  lng: number;
  located: Located | null;
}
export interface NetLink {
  source: string;
  target: string;
  open: number;
  overdue: number;
  count: number;
  settled: number;
  awaiting: number;
}
export function useNetwork() {
  // Poll faster while the geocoder is still finding shops.
  return useSWR<{ nodes: NetNode[]; links: NetLink[]; today: string; locating: number }>("/api/network", getJSON, {
    refreshInterval: (d) => (d?.locating ? 3000 : 15000),
  });
}

export interface AgentStat {
  name: AgentRun["agent"];
  runs: number;
  lastAt: string | null;
  avgMs: number | null;
  tokens: number;
}
export function useAgents(limit = 60, agent?: string) {
  return useSWR<{ runs: AgentRun[]; stats: AgentStat[]; ai: { mode: "ai" | "offline"; model: string }; total: number }>(
    `/api/agents?limit=${limit}${agent ? `&agent=${agent}` : ""}`,
    getJSON,
    { refreshInterval: 5000, keepPreviousData: true },
  );
}
