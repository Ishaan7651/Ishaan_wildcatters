"use client";

import type { AppState } from "@/lib/shared/types";
import { rupees } from "@/lib/shared/money";
import { SlipRow } from "@/components/slip/SlipRow";
import { Empty, SectionTitle } from "@/components/ui/primitives";
import { WaitingCards, waitingItems } from "./WaitingCards";

/** Everything waiting on the business you're acting as, most urgent first. */
export function NeedsYou({ state }: { state: AppState }) {
  const today = state.clock.today;
  const n = waitingItems(state).length;
  const dueSoon = state.dueSoon;
  const overdue = state.overdueToMe;
  return (
    <div className="space-y-10">
      <section id="your-word" className="scroll-mt-24">
        <SectionTitle count={n} hindi="आपकी हाँ चाहिए">
          Waiting for your word
        </SectionTitle>
        <WaitingCards state={state} layout="grid" />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section id="to-pay" className="scroll-mt-24">
          <SectionTitle count={dueSoon.length} hindi="देना है">
            You need to pay
          </SectionTitle>
          {dueSoon.length ? (
            <div className="sheet p-1.5">
              {dueSoon.map((s) => (
                <SlipRow key={s.id} slip={s} today={today} />
              ))}
            </div>
          ) : (
            <Empty title="Nothing due this week" body="Payments you owe show up here a week before they fall due." />
          )}
        </section>

        <section id="late-to-you" className="scroll-mt-24">
          <SectionTitle count={overdue.length} hindi="बकाया">
            Late to you{overdue.length > 0 && <span className="text-[14px] font-semibold text-stamp">· {rupees(overdue.reduce((a, s) => a + s.amount, 0))}</span>}
          </SectionTitle>
          {overdue.length ? (
            <div className="sheet p-1.5">
              {overdue.map((s) => (
                <SlipRow key={s.id} slip={s} today={today} />
              ))}
            </div>
          ) : (
            <Empty title="Everyone's paid you on time" />
          )}
        </section>
      </div>
    </div>
  );
}
