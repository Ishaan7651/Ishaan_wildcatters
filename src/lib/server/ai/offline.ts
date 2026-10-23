// Rules engine used when no OpenRouter key is set, or when the model is
// unreachable. Covers the common phrasings so the app keeps working.

import type { Intent } from "@/lib/shared/types";
import { addDays, addMonths, MONTHS, toUTC, fromUTC } from "@/lib/shared/dates";

const NUM_WORDS: Record<string, number> = {
  ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4, paanch: 5, panch: 5, five: 5,
  chhe: 6, che: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8, nau: 9, nine: 9, das: 10, ten: 10,
  bees: 20, twenty: 20, pachas: 50, pachaas: 50, fifty: 50, dedh: 1.5, dhai: 2.5, dhaai: 2.5,
};
const MULT: Record<string, number> = {
  k: 1000, thousand: 1000, hazaar: 1000, hazar: 1000, hajar: 1000, hajaar: 1000,
  lakh: 100000, lac: 100000, lakhs: 100000, l: 100000, cr: 10000000, crore: 10000000, sau: 100, hundred: 100,
};

const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

function monthIndex(s: string) {
  return MONTHS.findIndex((m) => s.toLowerCase().startsWith(m.toLowerCase()));
}

export function parseDue(text: string, today: string): { date: string; assumed: boolean; reason: string; span: string | null } {
  const t = text.toLowerCase();
  let m: RegExpMatchArray | null;

  if ((m = t.match(/(\d{4}-\d{2}-\d{2})/))) return { date: m[1], assumed: false, reason: "Exact date given", span: m[0] };

  if ((m = t.match(/(\d+|ek|do|teen|char|paanch|das|bees)\s*(day|days|din)\b/))) {
    const n = Number(m[1]) || NUM_WORDS[m[1]] || 0;
    return { date: addDays(today, n), assumed: false, reason: `${n} days from today`, span: m[0] };
  }
  if ((m = t.match(/(\d+|a|one|ek|do|two|teen|three)\s*(week|weeks|hafte|hafta)\b/))) {
    const n = Number(m[1]) || NUM_WORDS[m[1]] || 1;
    return { date: addDays(today, 7 * n), assumed: false, reason: `${n} week${n > 1 ? "s" : ""} from today`, span: m[0] };
  }
  if (/next week|agle hafte/.test(t)) return { date: addDays(today, 7), assumed: false, reason: "Next week", span: "next week" };
  if ((m = t.match(/(\d+|a|one|ek|do|two|teen|three)\s*(month|months|mahine|mahina)\b/))) {
    const n = Number(m[1]) || NUM_WORDS[m[1]] || 1;
    return { date: addMonths(today, n), assumed: false, reason: `${n} month${n > 1 ? "s" : ""} from today`, span: m[0] };
  }
  if (/month[- ]end|end of (the )?month|mahine ke end/.test(t)) {
    const d = toUTC(today);
    const last = fromUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    return { date: last, assumed: false, reason: "End of this month", span: "month end" };
  }
  if (/diwali/.test(t)) return { date: "2026-11-08" >= today ? "2026-11-08" : "2027-10-29", assumed: false, reason: "Diwali", span: "diwali" };
  if (/tomorrow/.test(t)) return { date: addDays(today, 1), assumed: false, reason: "Tomorrow", span: "tomorrow" };

  const withMonth =
    t.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s*)?${MONTH_RE}`)) ??
    t.match(new RegExp(`${MONTH_RE}\\s*(\\d{1,2})(?:st|nd|rd|th)?`));
  if (withMonth) {
    const first = /\d/.test(withMonth[1]);
    const day = Number(first ? withMonth[1] : withMonth[2]);
    const mi = monthIndex(first ? withMonth[2] : withMonth[1]);
    const d = toUTC(today);
    let y = d.getUTCFullYear();
    let cand = fromUTC(new Date(Date.UTC(y, mi, day)));
    if (cand < today) cand = fromUTC(new Date(Date.UTC(++y, mi, day)));
    return { date: cand, assumed: false, reason: "Date given", span: withMonth[0] };
  }
  if ((m = t.match(/(?:by|before|on|till|tak)\s*(?:the\s*)?(\d{1,2})(?:st|nd|rd|th)\b/)) || (m = t.match(/(\d{1,2})(?:st|nd|rd|th)\s*(?:tak|ko)/))) {
    const day = Number(m[1]);
    const d = toUTC(today);
    let cand = fromUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day)));
    if (cand < today) cand = fromUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, day)));
    return { date: cand, assumed: false, reason: `The ${m[1]}${ordinal(day)}`, span: m[0] };
  }
  return { date: addDays(today, 30), assumed: true, reason: "No date said — assumed 30 days, the usual trade credit", span: null };
}

function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

export function parseAmount(text: string, dateSpan: string | null): number | null {
  let t = text.toLowerCase().replace(/,/g, "");
  if (dateSpan) t = t.replace(dateSpan, " ");
  t = t.replace(/\b\d+\s*(days?|din|weeks?|months?|mahine)\b/g, " ");
  const cands: { v: number; strong: boolean }[] = [];
  const re = /(₹|rs\.?|inr|rupees?)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|hazaar|hazar|hajar|lakhs?|lac|cr|crore|hundred|sau)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const v = Number(m[2]) * (m[3] ? MULT[m[3].replace(/s$/, "")] ?? MULT[m[3]] ?? 1 : 1);
    cands.push({ v, strong: !!m[1] || !!m[3] });
  }
  const words = t.match(/\b(ek|do|teen|char|chaar|paanch|panch|das|bees|pachas|pachaas|dedh|dhai|dhaai|one|two|three|four|five|ten|twenty|fifty)\s+(hazaar|hazar|hajar|thousand|lakh|lac|sau|hundred)\b/);
  if (words) cands.push({ v: NUM_WORDS[words[1]] * MULT[words[2]], strong: true });
  const strong = cands.filter((c) => c.strong);
  const pool = strong.length ? strong : cands;
  if (!pool.length) return null;
  return Math.max(...pool.map((c) => c.v));
}

// Phrases that settle who owes whom on their own. "Sharma ji se 2k lena hai" is
// money to collect from Sharma, even when goods follow ("…elaichi ke").
const THEY_OWE_ME = [/\bowes? (?:me|us)\b/, /\bse\b.{0,40}?\b(?:lena|lene)\b/, /\budhaa?r (?:diya|diye|de diya)\b/, /\bgave\b.{0,40}\bon (?:credit|udhaa?r)\b/];
const I_OWE_THEM = [/\bi owe\b/, /\bi (?:have|need) to pay\b/, /\bko\b.{0,40}?\b(?:dena|dene)\b/, /\budhaa?r (?:liya|li|le liya)\b/, /\bi borrowed\b/, /\btook\b.{0,40}\bon (?:credit|udhaa?r)\b/];

/** The direction the words alone make clear, or null when they don't (or point both ways). */
export function directionCue(text: string): "they_owe_me" | "i_owe_them" | null {
  const t = text.toLowerCase();
  const theyOwe = THEY_OWE_ME.some((r) => r.test(t));
  const iOwe = I_OWE_THEM.some((r) => r.test(t));
  return theyOwe === iOwe ? null : theyOwe ? "they_owe_me" : "i_owe_them";
}

export function parseDirection(text: string): "they_owe_me" | "i_owe_them" {
  const cue = directionCue(text);
  if (cue) return cue;
  const t = text.toLowerCase();
  if (/\bdena hai\b|\bmujhe .* dena\b|\bmaine .* udhaar liya\b/.test(t)) return "i_owe_them";
  return "they_owe_me";
}

export function routeOffline(text: string): Intent {
  const t = text.toLowerCase().trim();
  if (/^(yes|yeah|yep|haan|han|ha|ji haan|ji|sahi|correct|right|confirm|confirmed|ok confirm|no|nahi|nahin|galat|wrong)\b/.test(t) || /\b(i do owe|sahi hai|confirm (it|this|karo|kar do))\b/.test(t)) return "respond";
  if (/\b(paid|received|got the money|mil gaya|mil gaye|de diya|de diye|chuka|cleared|settled|payment done|payment kar)\b/.test(t)) return "payment";
  if (/\b(remind|reminder|yaad dila|chase|follow up|tagada|tagaada|nudge)\b/.test(t)) return "remind";
  const amount = /\d|hazaar|lakh/.test(t);
  const owe = /\b(owes?|udhaa?r|baa?ki|lena|dena|credit)\b/.test(t);
  if (/\b(score|check|chk|pending|kitna|kitne|how many|how much|kaun|status|show|list|rank|worst|best|riskiest|position|batao|bata|dikhao|tell me)\b/.test(t) || /\?$/.test(t)) {
    if (!(owe && amount && !/\b(score|check|chk)\b/.test(t))) return "query";
  }
  if (owe || amount) return "record";
  return "help";
}

export function isNegative(text: string) {
  return /\b(no|nahi|nahin|galat|wrong|never|dispute|not mine|mera nahi)\b/i.test(text);
}
