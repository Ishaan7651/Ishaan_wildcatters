"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BookOpen, Bot, Database, Inbox, Mic, Network, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useAppState, postJSON } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";

export const NAV = [
  { href: "/", label: "Bolo", hindi: "बोलो", icon: Mic, hint: "Speak or ask" },
  { href: "/inbox", label: "Inbox", hindi: "डाक", icon: Inbox, hint: "Needs your word" },
  { href: "/bahi", label: "Ledger", hindi: "बही", icon: BookOpen, hint: "Your slips" },
  { href: "/map", label: "Trust map", hindi: "नक्शा", icon: Network, hint: "Who owes whom" },
  { href: "/lake", label: "Data lake", hindi: "भंडार", icon: Database, hint: "Every event" },
  { href: "/agents", label: "Agents", hindi: "कारिंदे", icon: Bot, hint: "The crew" },
];

function useInboxCount() {
  const { actorId } = useApp();
  const { data } = useAppState(actorId);
  if (!data) return 0;
  return data.toConfirm.length + data.paymentsToAck.length + data.countersToReview.length;
}

export function Rail() {
  const path = usePathname();
  const count = useInboxCount();
  const { toast, refreshAll, clearTurns } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <nav className="sticky top-[61px] hidden h-[calc(100dvh-61px)] w-[228px] shrink-0 flex-col border-r border-rule px-3 py-5 md:flex" aria-label="Main">
      <ul className="space-y-0.5">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          const Icon = n.icon;
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                className={clsx(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                  active ? "bg-sheet text-ink shadow-[var(--shadow-sheet)]" : "text-ink-2 hover:bg-paper-deep hover:text-ink",
                )}
              >
                {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-stamp" />}
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-carbon" : ""} />
                <span className="flex-1 text-[14.5px] font-medium">{n.label}</span>
                <span className="font-deva text-[12px] text-ink-4">{n.hindi}</span>
                {n.href === "/inbox" && count > 0 && (
                  <span className="absolute top-1.5 left-7 grid h-4 min-w-4 place-items-center rounded-full bg-stamp px-1 text-[10px] font-bold text-white tabular">{count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto space-y-3 px-1">
        <div className="rounded-2xl border border-rule bg-sheet-2 p-3.5 text-[12.5px] leading-relaxed text-ink-2">
          <p className="display text-[14px] font-semibold text-ink">The one rule</p>
          Everyone starts at <b className="text-ink">100</b>. A confirmed debt loses its borrower <b className="text-stamp">1 point</b> for every month it&apos;s paid late.
        </div>
        {confirmReset ? (
          <div className="flex items-center gap-2 text-[12px]">
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
        ) : (
          <button onClick={() => setConfirmReset(true)} className="flex items-center gap-2 text-[12px] text-ink-3 hover:text-ink">
            <RotateCcw size={13} /> Reset demo data
          </button>
        )}
      </div>
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  const count = useInboxCount();
  const items = [NAV[1], NAV[2], NAV[0], NAV[3], NAV[5]];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-[color-mix(in_oklab,var(--paper)_88%,transparent)] px-2 pt-1.5 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      aria-label="Main"
    >
      <ul className="grid grid-cols-5 items-end">
        {items.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          const Icon = n.icon;
          if (n.href === "/")
            return (
              <li key={n.href} className="flex justify-center">
                <Link
                  href="/"
                  className="-mt-6 grid size-[58px] place-items-center rounded-full bg-carbon text-white shadow-[0_10px_24px_-8px_var(--carbon)] ring-4 ring-paper dark:text-[#0d0e20]"
                  aria-label="Bolo — speak or ask"
                >
                  <Mic size={24} />
                </Link>
              </li>
            );
          return (
            <li key={n.href}>
              <Link href={n.href} className={clsx("relative flex flex-col items-center gap-0.5 py-1 text-[11px]", active ? "text-carbon" : "text-ink-3")}>
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                {n.label}
                {n.href === "/inbox" && count > 0 && (
                  <span className="absolute top-0 right-[calc(50%-18px)] grid h-4 min-w-4 place-items-center rounded-full bg-stamp px-1 text-[10px] font-bold text-white">{count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
