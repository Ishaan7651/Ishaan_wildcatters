"use client";

import { istDay, istTime, prettyDay } from "@/lib/shared/dates";
import { useAppState } from "@/lib/client/api";
import { useApp } from "@/components/providers/Providers";
import { NeedsYou } from "@/components/home/NeedsYou";
import { SlipRow } from "@/components/slip/SlipRow";
import { AgentGlyph, Empty, SectionTitle } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/PageHeader";

export default function InboxPage() {
  const { actorId, openSlip } = useApp();
  const { data: s } = useAppState(actorId);
  if (!s) return <div className="mx-auto max-w-[860px] space-y-4 pt-6"><div className="h-24 skeleton" /><div className="h-64 skeleton" /></div>;

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader eyebrow={s.me.business.name} title="Inbox" hindi="डाक">
        Slips other businesses wrote with you, payments to confirm, and everything the agents sent you.
      </PageHeader>

      <NeedsYou state={s} full />

      <section className="mt-10">
        <SectionTitle count={s.waitingOnOthers.length} hindi="उनकी हाँ बाकी">Waiting on others</SectionTitle>
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
        <SectionTitle count={s.notices.length} hindi="सूचना">From the agents</SectionTitle>
        {s.notices.length ? (
          <ol className="sheet divide-y divide-rule overflow-hidden">
            {s.notices.map((n) => (
              <li key={n.id}>
                <button onClick={() => openSlip(n.slipId)} className="grid w-full grid-cols-[auto_1fr_auto] gap-3 px-4 py-3.5 text-left hover:bg-sheet-2">
                  {n.agent ? <AgentGlyph agent={n.agent} size={30} /> : <span className="size-[30px] rounded-full bg-paper-deep" />}
                  <span className="min-w-0">
                    <span className={n.kind === "penalty" ? "block text-[14.5px] font-semibold text-stamp" : "block text-[14.5px] font-semibold text-ink"}>{n.title}</span>
                    <span className={n.kind === "reminder" || n.kind === "confirm_request" ? "hand mt-0.5 block text-[16px] leading-snug" : "mt-0.5 block text-[13.5px] text-ink-2"}>{n.body}</span>
                  </span>
                  <time className="text-right text-[11.5px] whitespace-nowrap text-ink-3">
                    {prettyDay(istDay(n.at), false)}
                    <br />
                    {istTime(n.at)}
                  </time>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <Empty title="Quiet so far" />
        )}
      </section>
    </div>
  );
}
