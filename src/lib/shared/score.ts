import type { Band } from "./types";
import { addDays, addMonths } from "./dates";

export const START_SCORE = 100;

/**
 * The scoring rule, in one place.
 *
 * A confirmed debt that is still unpaid the day after its due date costs the
 * borrower 1 point, and another point at the start of every further month of
 * delay. A debt due 31 Oct loses its 1st point on 1 Nov, its 2nd on 1 Dec, …
 * Points already lost stay lost after payment — that's the record.
 *
 * Returns the dates on which points dropped, up to and including `until`.
 */
export function penaltyDropDates(dueDate: string, until: string): string[] {
  const out: string[] = [];
  for (let month = 0; month < 600; month++) {
    const drop = addDays(addMonths(dueDate, month), 1);
    if (drop > until) break;
    out.push(drop);
  }
  return out;
}

/** The next date a point will drop if the debt stays unpaid past `today`. */
export function nextDropDate(dueDate: string, today: string): string {
  for (let month = 0; month < 600; month++) {
    const drop = addDays(addMonths(dueDate, month), 1);
    if (drop > today) return drop;
  }
  return today;
}

export function bandFor(score: number): Band {
  if (score >= 95) return "excellent";
  if (score >= 85) return "good";
  if (score >= 70) return "watch";
  return "risky";
}

export const BAND_META: Record<Band, { label: string; hindi: string; blurb: string }> = {
  excellent: { label: "Excellent", hindi: "पक्की साख", blurb: "Pays on time, almost always." },
  good: { label: "Good", hindi: "अच्छी साख", blurb: "Occasional delays." },
  watch: { label: "Watch", hindi: "कमज़ोर साख", blurb: "Regularly pays late." },
  risky: { label: "Risky", hindi: "ख़राब साख", blurb: "Long, repeated delays." },
};
