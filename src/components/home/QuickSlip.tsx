"use client";

import { useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import type { SlipView } from "@/lib/shared/types";
import { useApp } from "@/components/providers/Providers";
import { Avatar } from "@/components/ui/primitives";

/**
 * The tap-only way to write a slip: pick a direction, or tap someone you
 * trade with often. Opens the same form the Write button does, filled in.
 */
export function QuickSlip({ slips }: { slips: SlipView[] | undefined }) {
  const { actorId, openComposer } = useApp();

  // Who this shop trades with most, and which way the money usually goes.
  const regulars = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number; owesMe: number }>();
    for (const s of slips ?? []) {
      const theyOweMe = s.creditor.id === actorId;
      const other = theyOweMe ? s.debtor : s.creditor;
      const r = m.get(other.id) ?? { id: other.id, name: other.name, n: 0, owesMe: 0 };
      r.n++;
      if (theyOweMe) r.owesMe++;
      m.set(other.id, r);
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  }, [slips, actorId]);

  return (
    <section aria-label="Write a slip with taps" className="sheet flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-3.5">
      <div className="grid flex-1 grid-cols-2 gap-2 sm:max-w-[400px]">
        <button
          onClick={() => openComposer({ direction: "they_owe_me" })}
          className="group flex items-center gap-2.5 rounded-2xl bg-neem px-3 py-2.5 text-left text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/20 transition-transform group-hover:-rotate-12">
            <ArrowDownLeft size={20} strokeWidth={2.6} />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold">They owe me</span>
            <span className="block text-[11.5px] opacity-80">Money coming in</span>
          </span>
        </button>
        <button
          onClick={() => openComposer({ direction: "i_owe_them" })}
          className="group flex items-center gap-2.5 rounded-2xl bg-haldi px-3 py-2.5 text-left text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/20 transition-transform group-hover:rotate-12">
            <ArrowUpRight size={20} strokeWidth={2.6} />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold">I owe them</span>
            <span className="block text-[11.5px] opacity-85">Money going out</span>
          </span>
        </button>
      </div>

      {regulars.length > 0 && (
        <div className="flex min-w-0 items-center gap-2 sm:border-l sm:border-rule sm:pl-4">
          <span className="eyebrow shrink-0">Again</span>
          <ul className="flex min-w-0 flex-wrap items-center gap-1.5 py-1">
            {regulars.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => openComposer({ counterpartyId: r.id, direction: r.owesMe * 2 >= r.n ? "they_owe_me" : "i_owe_them" })}
                  className="group relative block rounded-[12px] transition-transform hover:-translate-y-0.5"
                  title={`New slip with ${r.name}`}
                  aria-label={`New slip with ${r.name}`}
                >
                  <Avatar id={r.id} name={r.name} size={38} className="ring-2 ring-sheet" />
                  <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-mor text-on-mor opacity-0 ring-2 ring-sheet transition-opacity group-hover:opacity-100">
                    <Plus size={10} strokeWidth={3} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
