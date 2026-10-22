"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Bell, BellOff, ChevronRight } from "lucide-react";
import type { AppState, Notice } from "@/lib/shared/types";
import type { SoundKind } from "@/lib/client/sounds";
import { diffDays, istDay, istTime, relDays } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { useAppState } from "@/lib/client/api";
import { useApp, type Toast } from "@/components/providers/Providers";
import { Popover } from "@/components/ui/overlay";
import { AgentGlyph, Avatar } from "@/components/ui/primitives";

const STYLE: Record<Notice["kind"], { sound: SoundKind; tone: Toast["tone"]; action?: string }> = {
  confirm_request: { sound: "request", tone: "warn", action: "Review" },
  payment_claimed: { sound: "request", tone: "warn", action: "Check" },
  confirmed: { sound: "good", tone: "good" },
  payment_ack: { sound: "good", tone: "good" },
  countered: { sound: "warn", tone: "warn", action: "Review" },
  disputed: { sound: "bad", tone: "bad", action: "Review" },
  reminder: { sound: "warn", tone: "warn", action: "Open" },
  penalty: { sound: "bad", tone: "bad", action: "Open" },
  withdrawn: { sound: "pop", tone: "default" },
};

function readSet(key: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}
function writeSet(key: string, ids: Iterable<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids].slice(-300)));
  } catch {}
}

export function pendingOf(s: AppState) {
  return [...s.toConfirm, ...s.paymentsToAck, ...s.countersToReview];
}

/**
 * The bell in the top bar. It also watches the polled home state: anything new
 * for this business pops up with a sound, and switching to a business that has
 * unanswered requests says so.
 */
export function NotificationBell() {
  const { actorId, toast, soundsOn, setSoundsOn, openSlip } = useApp();
  const { data } = useAppState(actorId);
  const [open, setOpen] = useState(false);
  const [rang, setRang] = useState(0);
  const [readTick, setReadTick] = useState(0);
  const lastActor = useRef<string | null>(null);

  const s = data && data.me.business.id === actorId ? data : undefined;
  const pending = s ? pendingOf(s) : [];
  const unread = useMemo(() => {
    if (!s) return 0;
    const read = readSet(`saakh.read.${actorId}`);
    return read ? s.notices.filter((n) => !read.has(n.id)).length : 0;
    // readTick: re-read after the bell is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, actorId, readTick]);

  useEffect(() => {
    if (!s) return;
    const key = `saakh.seen.${actorId}`;
    const seen = readSet(key);
    // First visit as this business: everything so far counts as already seen.
    const fresh = seen ? s.notices.filter((n) => !seen.has(n.id)) : [];
    // Remind about waiting requests when switching to a business, once per tab session.
    let switched = lastActor.current !== actorId;
    lastActor.current = actorId;
    try {
      if (switched && sessionStorage.getItem("saakh.alerted") === actorId) switched = false;
      sessionStorage.setItem("saakh.alerted", actorId);
    } catch {}
    writeSet(key, new Set([...(seen ?? []), ...s.notices.map((n) => n.id)]));

    if (!readSet(`saakh.read.${actorId}`)) writeSet(`saakh.read.${actorId}`, s.notices.map((n) => n.id));

    if (fresh.length) {
      fresh.slice(0, 3).forEach((n, i) => {
        const st = STYLE[n.kind];
        setTimeout(() => {
          if (i === 0) setRang((r) => r + 1);
          toast({
              alert: true,
              agent: n.agent,
              title: n.title,
              body: n.body,
              tone: st.tone,
              sound: i === 0 ? st.sound : undefined,
              action: st.action ? { label: st.action, slipId: n.slipId } : undefined,
          });
        }, i * 450);
      });
      if (fresh.length > 3)
        setTimeout(() => toast({ alert: true, title: `${fresh.length - 3} more updates`, body: "Open the bell to see them all.", tone: "default" }), 3 * 450);
    } else if (switched) {
      const p = pendingOf(s);
      if (p.length) {
        const who = [...new Set(p.map((v) => (v.creditor.id === actorId ? v.debtor.name : v.creditor.name)))];
        setTimeout(() => setRang((r) => r + 1), 0);
        toast({
          alert: true,
          agent: "gawah",
          tone: "warn",
          sound: "request",
          title: `${p.length} request${p.length === 1 ? "" : "s"} waiting for your answer`,
          body: who.length === 1 ? `From ${who[0]}.` : `From ${who.slice(0, 2).join(", ")}${who.length > 2 ? ` and ${who.length - 2} more` : ""}.`,
          action: { label: "Answer", href: "/inbox" },
        });
      }
    }
  }, [s, actorId, toast]);

  const markRead = () => {
    if (!s) return;
    writeSet(`saakh.read.${actorId}`, s.notices.map((n) => n.id));
    setReadTick((t) => t + 1);
  };

  const today = s?.clock.today ?? istDay();
  const when = (iso: string) => {
    const d = diffDays(istDay(iso), today);
    return d === 0 ? istTime(iso) : relDays(d);
  };

  return (
    <div className="relative">
      <button
        data-popover-trigger
        onClick={() => {
          setOpen((o) => !o);
          if (!open) markRead();
        }}
        className={clsx(
          "relative grid size-9 place-items-center rounded-full border transition-colors",
          pending.length ? "border-stamp/40 bg-stamp-soft text-stamp" : "border-rule bg-sheet text-ink-2 hover:border-rule-2",
        )}
        aria-label={pending.length ? `Notifications — ${pending.length} waiting for your answer` : "Notifications"}
        aria-expanded={open}
      >
        <Bell key={rang} size={17} strokeWidth={2.2} className="origin-top" style={rang ? { animation: "ring 1.1s ease-in-out 2" } : undefined} />
        {pending.length > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-stamp px-1 text-[10.5px] font-bold text-white tabular ring-2 ring-paper">
            {pending.length}
          </span>
        ) : (
          unread > 0 && <span className="absolute top-0 right-0 size-2.5 rounded-full bg-genda ring-2 ring-paper" />
        )}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} className="w-[min(94vw,380px)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <p className="display text-[16px] font-semibold text-ink">Notifications</p>
          <button
            onClick={() => setSoundsOn(!soundsOn)}
            className={clsx(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
              soundsOn ? "bg-mor-soft text-mor-ink" : "bg-paper-deep text-ink-3",
            )}
            aria-pressed={soundsOn}
          >
            {soundsOn ? <Bell size={13} /> : <BellOff size={13} />}
            {soundsOn ? "Sound on" : "Muted"}
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">
          {pending.length > 0 && (
            <div className="border-b border-rule bg-stamp-soft/50 p-2">
              <p className="eyebrow px-2 pt-1 pb-1.5 !text-stamp">Waiting for your answer</p>
              <ul>
                {pending.slice(0, 5).map((v) => {
                  const other = v.creditor.id === actorId ? v.debtor : v.creditor;
                  return (
                    <li key={v.id}>
                      <button
                        onClick={() => {
                          openSlip(v.id);
                          setOpen(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-sheet"
                      >
                        <Avatar id={other.id} name={other.name} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-ink">{other.name}</span>
                          <span className="block text-[12px] text-ink-3">
                            {rupees(v.amount)} · {v.status === "awaiting" ? "confirm the slip" : v.payment && !v.payment.acknowledged ? "confirm the payment" : "review their change"}
                          </span>
                        </span>
                        <span className="rounded-full bg-stamp px-2.5 py-1 text-[11.5px] font-bold text-white">Answer</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {pending.length > 5 && (
                <Link href="/inbox" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1 py-1.5 text-[12.5px] font-semibold text-stamp hover:underline">
                  All {pending.length} in the inbox <ChevronRight size={13} />
                </Link>
              )}
            </div>
          )}

          {s && s.notices.length > 0 ? (
            <ul className="p-2">
              {s.notices.slice(0, 15).map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      openSlip(n.slipId);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-paper-deep"
                  >
                    {n.agent ? <AgentGlyph agent={n.agent} size={28} /> : <span className="mt-2 size-2 shrink-0 rounded-full bg-ink-4" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] leading-snug font-semibold text-ink">{n.title}</span>
                      <span className="line-clamp-2 block text-[12.5px] text-ink-3">{n.body}</span>
                    </span>
                    <span className="shrink-0 pt-0.5 text-[11px] text-ink-4">{when(n.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !pending.length && <p className="px-4 py-10 text-center text-[13.5px] text-ink-3">Nothing yet. Requests and replies will ring here.</p>
          )}
        </div>
      </Popover>
    </div>
  );
}
