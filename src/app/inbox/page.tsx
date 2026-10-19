"use client";

import clsx from "clsx";
import { istDay, istTime, prettyDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { useAppState } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { NeedsYou } from "@/components/home/NeedsYou";
import { waitingItems } from "@/components/home/WaitingCards";
import { SlipRow } from "@/components/slip/SlipRow";
import { AgentGlyph, Empty, SectionTitle } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/PageHeader";

export default function InboxPage() {
  const { actorId, openSlip } = useApp();
  const { data: s } = useAppState(actorId);
  if (!s)
    return (
      <div className="mx-auto max-w-[1040px] space-y-4 pt-6">
        <div className="h-24 skeleton" />
        <div className="h-64 skeleton" />
      </div>
    );

  const waiting = waitingItems(s).length;
  const late = s.overdueToMe.reduce((a, x) => a + x.amount, 0);
  const tiles = [
    { href: "#your-word", n: waiting, label: waiting === 1 ? "needs your yes" : "need your yes", tone: waiting ? "var(--genda-2)" : "var(--ink-4)" },
    { href: "#to-pay", n: s.dueSoon.length, label: "to pay this week", tone: s.dueSoon.length ? "var(--haldi)" : "var(--ink-4)" },
    { href: "#late-to-you", n: s.overdueToMe.length, label: late ? `late to you · ${rupees(late)}` : "late to you", tone: s.overdueToMe.length ? "var(--stamp)" : "var(--ink-4)" },
    { href: "#waiting-on-others", n: s.waitingOnOthers.length, label: "waiting on others", tone: "var(--mor)" },
  ];

  return (
    <div className="mx-auto max-w-[1040px]">
      <PageHeader eyebrow={s.me.business.name} title="Inbox" hindi="डाक">
        Slips other businesses wrote with you, payments to confirm, and notes from the agents.
      </PageHeader>

      <nav aria-label="Inbox sections" className="mb-10 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {tiles.map((t) => (
          <a key={t.href} href={t.href} className="group sheet flex items-center gap-3 px-4 py-3 transition-shadow hover:shadow-[var(--shadow-lift)]">
            <span className="display-wide text-[30px] leading-none tabular" style={{ color: t.tone }}>
              {t.n}
            </span>
            <span className="text-[13px] leading-tight text-ink-2 group-hover:text-ink">{t.label}</span>
          </a>
        ))}
      </nav>

      <NeedsYou state={s} />

      <section id="waiting-on-others" className="mt-10 scroll-mt-24">
        <SectionTitle count={s.waitingOnOthers.length} hindi="उनकी हाँ बाकी">
          Waiting on others
        </SectionTitle>
        {s.waitingOnOthers.length ? (
          <div className="sheet p-1.5">
            {s.waitingOnOthers.map((x) => (
              <SlipRow key={x.id} slip={x} today={s.clock.today} />
            ))}
          </div>
        ) : (
          <Empty title="Nothing pending" body="Slips you send show up here until the other side says yes." />
        )}
      </section>

      <section className="mt-10">
        <SectionTitle count={s.notices.length} hindi="सूचना">
          From the agents
        </SectionTitle>
        {s.notices.length ? (
          <ol className="space-y-2">
            {s.notices.map((n) => {
              const handwritten = n.kind === "reminder" || n.kind === "confirm_request";
              return (
                <li key={n.id}>
                  <button
                    onClick={() => openSlip(n.slipId)}
                    className={clsx(
                      "grid w-full grid-cols-[auto_1fr_auto] gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-colors",
                      n.kind === "penalty" ? "border-stamp/25 bg-stamp-soft/50 hover:bg-stamp-soft" : "border-rule bg-sheet hover:bg-sheet-2",
                    )}
                  >
                    {n.agent ? <AgentGlyph agent={n.agent} size={34} /> : <span className="size-[34px] rounded-full bg-paper-deep" />}
                    <span className="min-w-0">
                      <span className={clsx("block text-[14.5px] font-semibold", n.kind === "penalty" ? "text-stamp" : "text-ink")}>{n.title}</span>
                      <span className={handwritten ? "hand mt-0.5 block text-[16.5px] leading-snug" : "mt-0.5 block text-[13.5px] text-ink-2"}>{n.body}</span>
                    </span>
                    <time className="text-right text-[11.5px] whitespace-nowrap text-ink-3">
                      {prettyDay(istDay(n.at), false)}
                      <br />
                      {istTime(n.at)}
                    </time>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <Empty title="Quiet so far" />
        )}
      </section>
    </div>
  );
}
