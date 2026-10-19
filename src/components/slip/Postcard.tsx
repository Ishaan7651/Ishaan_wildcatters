"use client";

import clsx from "clsx";
import { prettyDay } from "@/lib/shared/dates";

const TONE: Record<string, { label: string; color: string }> = {
  gentle: { label: "Gentle", color: "var(--neem)" },
  firm: { label: "Firm", color: "var(--haldi-ink)" },
  serious: { label: "Serious", color: "var(--stamp)" },
};

/** Dakiya's reminders arrive as postcards. */
export function Postcard({
  to,
  from,
  message,
  tone,
  date,
  editable,
  onChange,
  compact,
}: {
  to: string;
  from: string;
  message: string;
  tone: string;
  date?: string;
  editable?: boolean;
  onChange?: (m: string) => void;
  compact?: boolean;
}) {
  const t = TONE[tone] ?? TONE.gentle;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--haldi)_35%,var(--rule))] bg-postcard shadow-[var(--shadow-sheet)]">
      <div className="h-1.5" style={{ background: `repeating-linear-gradient(135deg, var(--stamp) 0 10px, transparent 10px 20px, var(--carbon) 20px 30px, transparent 30px 40px)` }} />
      <div className={clsx("grid gap-4", compact ? "grid-cols-[1fr_auto] p-3.5" : "grid-cols-[1fr_auto] p-4 sm:p-5")}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow !text-[10px]">Post card · डाक</span>
            <span className="rounded-full px-2 py-px text-[11px] font-semibold" style={{ color: t.color, background: `color-mix(in oklab, ${t.color} 13%, transparent)` }}>
              {t.label}
            </span>
          </div>
          {editable ? (
            <textarea
              value={message}
              onChange={(e) => onChange?.(e.target.value)}
              rows={4}
              className="hand mt-2 w-full resize-none bg-transparent text-[17px] leading-[1.45] outline-none"
              aria-label="Reminder message"
            />
          ) : (
            <p className={clsx("hand mt-2 leading-[1.45]", compact ? "text-[15px]" : "text-[17px]")}>{message}</p>
          )}
        </div>
        <div className="flex w-[84px] flex-col items-end gap-2 border-l border-dashed border-[color-mix(in_oklab,var(--haldi)_45%,var(--rule))] pl-3">
          <div className="grid size-12 place-items-center rounded-[4px] border-2 border-dotted border-stamp/60 font-deva text-[16px] text-stamp">डा</div>
          {date && (
            <div className="grid size-14 place-items-center rounded-full border border-ink-3/50 text-center text-[9px] leading-tight font-semibold tracking-wide text-ink-3 uppercase -rotate-12">
              Saakh
              <br />
              {prettyDay(date, false)}
            </div>
          )}
          <div className="mt-auto text-right text-[11px] leading-tight text-ink-3">
            <span className="block">To {to}</span>
            <span className="block">from {from}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
