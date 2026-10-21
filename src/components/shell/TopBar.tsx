"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Check, ChevronDown, Clock3, NotebookPen, Search } from "lucide-react";
import { addDays, diffDays, weekdayDay } from "@/lib/shared/dates";
import { postJSON, useAppState, useBusinesses } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { Popover } from "@/components/ui/overlay";
import { Avatar, Button, ScoreChip } from "@/components/ui/primitives";

export function TopBar() {
  const { actorId, setDiaryOpen } = useApp();
  const { data } = useAppState(actorId);
  return (
    <header className="sticky top-0 z-40 border-b border-rule/70 bg-[color-mix(in_oklab,var(--paper)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-[64px] max-w-[1560px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5 pr-2 md:w-[212px]" aria-label="Saakh home">
          <span className="grid h-9 -rotate-3 place-items-center rounded-[10px] bg-genda px-2 font-deva text-[22px] leading-none font-bold text-on-genda shadow-[0_2px_0_var(--genda-2)] transition-transform group-hover:rotate-0">
            <span className="translate-y-[2px]">साख</span>
          </span>
          <span className="display-wide hidden text-[17px] leading-none text-ink sm:block">Saakh</span>
        </Link>

        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-2.5">
          {data && (
            <span
              className={clsx(
                "hidden items-center gap-2 rounded-full px-3 py-1 text-[12px] font-medium xl:inline-flex",
                data.ai.mode === "ai" ? "bg-neem-soft text-neem" : "bg-haldi-soft text-haldi-ink",
              )}
              title={data.ai.mode === "ai" ? `Agents run on OpenRouter · ${data.ai.model}` : "No OpenRouter key — agents use the built-in rules. Add OPENROUTER_API_KEY to .env.local."}
            >
              <span className="relative flex size-2">
                <span className={clsx("absolute inset-0 rounded-full", data.ai.mode === "ai" ? "bg-neem" : "bg-haldi")} style={{ animation: "pulse-ring 2s ease-out infinite" }} />
                <span className={clsx("relative size-2 rounded-full", data.ai.mode === "ai" ? "bg-neem" : "bg-haldi")} />
              </span>
              {data.ai.mode === "ai" ? "AI on" : "Rules mode"}
            </span>
          )}
          <TimeMachine />
          <PersonaSwitcher />
          <button
            onClick={() => setDiaryOpen(true)}
            className="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-paper-deep hover:text-ink md:hidden"
            aria-label="Open the agents' diary"
            title="Agents' diary"
          >
            <NotebookPen size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

function PersonaSwitcher() {
  const { actorId, setActor } = useApp();
  const { data: list } = useBusinesses();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const me = list?.find((b) => b.id === actorId);
  const filtered = useMemo(
    () => (list ?? []).filter((b) => !q || `${b.name} ${b.owner} ${b.city}`.toLowerCase().includes(q.toLowerCase())),
    [list, q],
  );
  return (
    <div className="relative">
      <button
        data-popover-trigger
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-full border border-rule bg-sheet py-1 pr-2.5 pl-1 hover:border-rule-2"
        aria-expanded={open}
        aria-label="Switch business"
      >
        {me ? <Avatar id={me.id} name={me.name} size={30} className="!rounded-full" /> : <span className="size-[30px] rounded-full skeleton" />}
        <span className="hidden max-w-[160px] truncate text-left text-[13.5px] font-semibold text-ink sm:block">{me?.name ?? "…"}</span>
        <ChevronDown size={15} className="text-ink-3" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-[min(92vw,360px)] overflow-hidden">
        <div className="border-b border-rule p-3">
          <p className="eyebrow px-1">Act as</p>
          <label className="mt-2 flex items-center gap-2 rounded-xl border border-rule-2 bg-sheet-2 px-3 py-2">
            <Search size={15} className="text-ink-3" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a business" className="w-full bg-transparent text-[14px] outline-none" />
          </label>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-1.5">
          {filtered.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => {
                  setActor(b.id);
                  setOpen(false);
                  setQ("");
                }}
                className={clsx("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-paper-deep", b.id === actorId && "bg-mor-soft/70")}
              >
                <Avatar id={b.id} name={b.name} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{b.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {b.owner} · {b.category} · {b.city}
                  </span>
                </span>
                <ScoreChip score={b.score} band={b.band} />
                {b.id === actorId && <Check size={16} className="text-mor" />}
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}

function TimeMachine() {
  const { actorId, refreshAll, toast } = useApp();
  const { data } = useAppState(actorId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const real = data?.clock.realToday;
  const today = data?.clock.today;
  const offset = real && today ? diffDays(today, real) : 0;
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? offset;

  const go = async (days: number) => {
    if (!real) return;
    setBusy(true);
    try {
      const target = addDays(real, days);
      const r = await postJSON<{ today: string; patrol: { newPoints: number; overdue: number } | null }>("/api/clock", { day: days === 0 ? null : target });
      await refreshAll();
      setDraft(null);
      toast({
        agent: "chowkidar",
        title: days === 0 ? "Back to the real date" : `Saakh clock moved to ${weekdayDay(r.today)}`,
        body: r.patrol
          ? r.patrol.newPoints
            ? `Chowkidar patrolled and took ${r.patrol.newPoints} point${r.patrol.newPoints === 1 ? "" : "s"} off late payers. ${r.patrol.overdue} debts are overdue.`
            : `Chowkidar patrolled — no new points lost. ${r.patrol.overdue} debts overdue.`
          : "Scores now show this day.",
      });
    } catch (e) {
      toast({ title: "Couldn't move the clock", body: (e as Error).message, tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        data-popover-trigger
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors",
          data?.clock.simulated ? "border-haldi bg-haldi-soft text-haldi-ink" : "border-rule bg-sheet text-ink-2 hover:border-rule-2",
        )}
        aria-label="Time machine"
      >
        <Clock3 size={15} />
        <span className="hidden sm:inline">{today ? weekdayDay(today) : "…"}</span>
        {data?.clock.simulated && <span className="rounded-full bg-haldi px-1.5 text-[11px] font-bold text-white">{offset > 0 ? `+${offset}d` : `${offset}d`}</span>}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-[min(92vw,380px)] p-5">
        <p className="eyebrow">Time machine</p>
        <p className="display mt-1 text-[24px] font-semibold text-ink">{real ? weekdayDay(addDays(real, shown)) : "…"}</p>
        <p className="text-[13px] text-ink-3">
          {shown === 0 ? "The real date" : shown > 0 ? `${shown} days ahead of today` : `${-shown} days back`}
        </p>
        <input
          type="range"
          min={-30}
          max={365}
          value={shown}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={() => draft !== null && draft !== offset && go(draft)}
          onKeyUp={(e) => (e.key === "Enter" || e.key.startsWith("Arrow")) && draft !== null && draft !== offset && go(draft)}
          className="mt-4 w-full"
          aria-label="Days from today"
          disabled={busy}
        />
        <div className="mt-1 flex justify-between text-[11px] text-ink-4">
          <span>−30d</span>
          <span>today</span>
          <span>+1 year</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["+1 week", 7],
            ["+1 month", 30],
            ["+3 months", 91],
          ].map(([l, d]) => (
            <Button key={l as string} size="sm" variant="secondary" disabled={busy} onClick={() => go(offset + (d as number))}>
              {l}
            </Button>
          ))}
          <Button size="sm" variant="quiet" disabled={busy || offset === 0} onClick={() => go(0)}>
            Back to today
          </Button>
        </div>
      </Popover>
    </div>
  );
}
