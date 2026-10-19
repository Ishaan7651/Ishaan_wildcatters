"use client";

import Link from "next/link";
import type { AppState, SlipView } from "@/lib/shared/types";
import { rupees } from "@/lib/shared/money";
import { useApp } from "@/components/providers/Providers";
import { SlipRow } from "@/components/slip/SlipRow";
import { useSlipAction } from "@/components/slip/SlipDrawer";
import { Button, Empty, SectionTitle } from "@/components/ui/primitives";

export function ConfirmButtons({ slip }: { slip: SlipView }) {
  const { openSlip } = useApp();
  const { run, busy } = useSlipAction();
  return (
    <span className="flex items-center gap-1.5">
      <Button size="sm" variant="primary" loading={busy === "confirm"} onClick={() => run(slip, "confirm", {}, `Stamped — ${rupees(slip.amount)} is on record`)}>
        Confirm
      </Button>
      <Button size="sm" variant="ghost" onClick={() => openSlip(slip.id)}>
        Dispute
      </Button>
    </span>
  );
}

export function AckButtons({ slip }: { slip: SlipView }) {
  const { run, busy } = useSlipAction();
  return (
    <Button size="sm" variant="primary" loading={busy === "ack_payment"} onClick={() => run(slip, "ack_payment", {}, "Payment confirmed — slip closed")}>
      Received
    </Button>
  );
}

/** Everything waiting on the business you're acting as, most urgent first. */
export function NeedsYou({ state, full = false }: { state: AppState; full?: boolean }) {
  const today = state.clock.today;
  const n = state.toConfirm.length + state.paymentsToAck.length + state.countersToReview.length;
  const dueSoon = state.dueSoon;
  const overdue = state.overdueToMe;
  return (
    <section className="mt-12 space-y-10" aria-label="Needs you">
      <div>
        <SectionTitle
          count={n}
          hindi="आपकी हाँ चाहिए"
          action={!full && n > 0 ? <Link href="/inbox" className="text-[13px] font-medium text-carbon hover:underline">Open inbox →</Link> : null}
        >
          Needs your word
        </SectionTitle>
        {n === 0 ? (
          <Empty title="Nothing waiting on you" body="When someone records a debt with you, it shows up here for a yes or no." />
        ) : (
          <div className="sheet divide-y divide-rule p-1.5">
            {state.toConfirm.map((s) => (
              <SlipRow key={s.id} slip={s} today={today} actions={<ConfirmButtons slip={s} />} />
            ))}
            {state.paymentsToAck.map((s) => (
              <SlipRow key={s.id} slip={s} today={today} actions={<AckButtons slip={s} />} />
            ))}
            {state.countersToReview.map((s) => (
              <SlipRow key={s.id} slip={s} today={today} />
            ))}
          </div>
        )}
      </div>

      {(dueSoon.length > 0 || full) && (
        <div>
          <SectionTitle count={dueSoon.length} hindi="देना है">You need to pay</SectionTitle>
          {dueSoon.length ? (
            <div className="sheet p-1.5">
              {dueSoon.map((s) => (
                <SlipRow key={s.id} slip={s} today={today} />
              ))}
            </div>
          ) : (
            <Empty title="Nothing due this week" />
          )}
        </div>
      )}

      {(overdue.length > 0 || full) && (
        <div>
          <SectionTitle count={overdue.length} hindi="बकाया">Overdue to you</SectionTitle>
          {overdue.length ? (
            <div className="sheet p-1.5">
              {overdue.map((s) => (
                <SlipRow key={s.id} slip={s} today={today} />
              ))}
            </div>
          ) : (
            <Empty title="Everyone's paid you on time" />
          )}
        </div>
      )}
    </section>
  );
}
