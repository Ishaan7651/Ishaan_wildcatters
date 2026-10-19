"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BookOpen, Bot, Database, Inbox, Mic, Network, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useAppState, postJSON } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";

export const NAV = [
  { href: "/", label: "Bolo", hindi: "बोलो", icon: Mic, hint: "Speak or ask anything" },
  { href: "/inbox", label: "Inbox", hindi: "डाक", icon: Inbox, hint: "Waiting for your yes" },
  { href: "/bahi", label: "Ledger", hindi: "बही", icon: BookOpen, hint: "Every slip, every rupee" },
  { href: "/map", label: "Trust map", hindi: "नक्शा", icon: Network, hint: "Who owes whom" },
  { href: "/lake", label: "Data lake", hindi: "भंडार", icon: Database, hint: "The tamper-proof log" },
  { href: "/agents", label: "Agents", hindi: "कारिंदे", icon: Bot, hint: "The AI crew at work" },
];

function useInboxCount() {
  const { actorId } = useApp();
  const { data } = useAppState(actorId);
  if (!data) return 0;
  return data.toConfirm.length + data.paymentsToAck.length + data.countersToReview.length;
}

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function Rail() {
  const path = usePathname();
  const count = useInboxCount();
  const { toast, refreshAll, clearTurns } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <nav className="sticky top-[64px] hidden h-[calc(100dvh-64px)] w-[236px] shrink-0 flex-col px-3 py-6 md:flex" aria-label="Main">
      <RailGroup items={NAV.slice(0, 4)} path={path} count={count} />
      <p className="eyebrow mt-7 mb-2 px-3 !text-[10px]">Under the hood</p>
      <RailGroup items={NAV.slice(4)} path={path} count={0} />

      <div className="mt-auto px-3">
        {confirmReset ? (
          <div className="rounded-2xl border border-stamp/30 bg-stamp-soft/60 p-3 text-[12.5px] text-ink-2">
            <p>Start a fresh market with new slips?</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                className="rounded-full bg-stamp px-3 py-1.5 font-semibold text-white"
                onClick={async () => {
                  await postJSON("/api/reset", {});
                  clearTurns();
                  setConfirmReset(false);
                  await refreshAll();
                  toast({ title: "Demo data reset", body: "Fresh market, fresh slips, today's date." });
                }}
              >
                Reset everything
              </button>
              <button className="text-ink-3 hover:text-ink" onClick={() => setConfirmReset(false)}>
                Keep
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmReset(true)} className="flex items-center gap-2 text-[12px] text-ink-3 hover:text-ink">
            <RotateCcw size={13} /> Reset demo data
          </button>
        )}
      </div>
    </nav>
  );
}

function RailGroup({ items, path, count }: { items: typeof NAV; path: string; count: number }) {
  return (
    <ul className="space-y-1">
      {items.map((n) => {
        const active = isActive(path, n.href);
        const Icon = n.icon;
        const voice = n.href === "/";
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "group relative flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors",
                active ? "bg-sheet shadow-[var(--shadow-sheet)]" : "hover:bg-sheet/60",
              )}
            >
              <span
                className={clsx(
                  "relative grid size-9 shrink-0 place-items-center rounded-xl transition-colors",
                  active
                    ? voice
                      ? "bg-genda text-on-genda"
                      : "bg-mor text-on-mor"
                    : "bg-paper-deep text-ink-2 group-hover:bg-sheet group-hover:text-ink",
                )}
              >
                <Icon size={17} strokeWidth={active ? 2.3 : 1.9} />
                {n.href === "/inbox" && count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-stamp px-1 text-[10.5px] font-bold text-white tabular ring-2 ring-paper">
                    {count}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={clsx("text-[14.5px] font-semibold", active ? "text-ink" : "text-ink-2 group-hover:text-ink")}>{n.label}</span>
                  <span className="font-deva text-[11.5px] text-ink-4">{n.hindi}</span>
                </span>
                <span className="block truncate text-[11.5px] text-ink-3">{n.hint}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileNav() {
  const path = usePathname();
  const count = useInboxCount();
  const items = [NAV[1], NAV[2], NAV[0], NAV[3], NAV[5]];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-[color-mix(in_oklab,var(--paper)_90%,transparent)] px-2 pt-1.5 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      aria-label="Main"
    >
      <ul className="grid grid-cols-5 items-end">
        {items.map((n) => {
          const active = isActive(path, n.href);
          const Icon = n.icon;
          if (n.href === "/")
            return (
              <li key={n.href} className="flex justify-center">
                <Link
                  href="/"
                  className="relative -mt-7 grid size-[62px] place-items-center rounded-full bg-genda text-on-genda shadow-[0_12px_26px_-10px_var(--genda-2)] ring-[5px] ring-paper"
                  aria-label="Bolo — speak or ask"
                >
                  <span className="absolute inset-0 rounded-full bg-genda" style={{ animation: "breathe 3.2s ease-in-out infinite" }} aria-hidden />
                  <Mic size={25} strokeWidth={2.3} className="relative" />
                </Link>
              </li>
            );
          return (
            <li key={n.href}>
              <Link href={n.href} aria-current={active ? "page" : undefined} className={clsx("relative flex flex-col items-center gap-0.5 py-1 text-[11px] font-medium", active ? "text-mor" : "text-ink-3")}>
                <span className={clsx("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-mor-soft")}>
                  <Icon size={19} strokeWidth={active ? 2.3 : 1.8} />
                </span>
                {n.label}
                {n.href === "/inbox" && count > 0 && (
                  <span className="absolute top-0 right-[calc(50%-20px)] grid h-4 min-w-4 place-items-center rounded-full bg-stamp px-1 text-[10px] font-bold text-white">{count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
