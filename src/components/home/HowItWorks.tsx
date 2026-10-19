"use client";

import { useState, useSyncExternalStore } from "react";
import { Mic, X } from "lucide-react";
import { ScoreRing } from "@/components/score/ScoreRing";
import { Stamp } from "@/components/slip/Stamp";

const KEY = "saakh.howto.hidden";

const noSubscribe = () => () => {};
function readHidden() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Saakh in three pictures. Shown until someone closes it. */
export function HowItWorks() {
  // Hidden on the server, then whatever this browser remembered.
  const remembered = useSyncExternalStore(noSubscribe, readHidden, () => true);
  const [closed, setClosed] = useState(false);
  if (remembered || closed) return null;

  const steps = [
    {
      art: (
        <span className="grid size-[60px] place-items-center rounded-full bg-genda text-on-genda">
          <Mic size={26} strokeWidth={2.3} />
        </span>
      ),
      title: "Say it",
      body: <>“Sharma owes me ₹2,000 by Diwali.” Munshi writes the slip for you.</>,
    },
    {
      art: (
        <span className="grid h-[60px] place-items-center">
          <Stamp kind="confirmed" scale={0.5} animate={false} />
        </span>
      ),
      title: "They say haan",
      body: <>Sharma gets it and confirms. Nothing counts until both sides agree.</>,
    },
    {
      art: <ScoreRing score={97} band="excellent" size={60} />,
      title: "Late costs points",
      body: (
        <>
          Everyone starts at <b className="text-ink">100</b>. Each month a debt runs late, the borrower loses <b className="text-stamp">1 point</b>.
        </>
      ),
    },
  ];

  return (
    <section aria-label="How Saakh works" className="relative rounded-[22px] border border-rule bg-sheet/70 p-4 sm:p-5">
      <button
        onClick={() => {
          setClosed(true);
          try {
            localStorage.setItem(KEY, "1");
          } catch {}
        }}
        className="absolute top-3 right-3 grid size-8 place-items-center rounded-full text-ink-4 hover:bg-paper-deep hover:text-ink"
        aria-label="Hide how Saakh works"
      >
        <X size={15} />
      </button>
      <p className="eyebrow mb-3">How Saakh works</p>
      <ol className="grid gap-4 sm:grid-cols-3 sm:gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3 sm:flex-col sm:gap-2.5">
            <div className="flex shrink-0 items-center gap-2">
              {s.art}
              {i < steps.length - 1 && (
                <svg viewBox="0 0 40 12" className="hidden h-3 w-12 text-ink-4 sm:block" aria-hidden>
                  <path d="M0 6 H34 M29 1 L36 6 L29 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="0" />
                </svg>
              )}
            </div>
            <div>
              <p className="display text-[16px] font-bold text-ink">
                <span className="mr-1.5 text-ink-4 tabular">{i + 1}.</span>
                {s.title}
              </p>
              <p className="text-[13px] leading-snug text-ink-2">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
