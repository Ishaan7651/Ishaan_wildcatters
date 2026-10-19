// Date-only helpers. Ledger dates are plain "YYYY-MM-DD" strings in IST so
// that "due on 31 Oct" means the same thing on every server and browser.

const IST_OFFSET_MIN = 330;
const DAY_MS = 86_400_000;

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toUTC(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The IST calendar date for an instant. */
export function istDay(instant: string | number | Date = Date.now()): string {
  const t = new Date(instant).getTime();
  return new Date(t + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = toUTC(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** Adds calendar months, clamping to the last day (31 Oct + 1 month = 30 Nov). */
export function addMonths(day: string, n: number): string {
  const d = toUTC(day);
  const dom = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(dom, last));
  return fromUTC(target);
}

/** a − b in whole days. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / DAY_MS);
}

export function minDay(a: string, b: string): string {
  return a < b ? a : b;
}

export function prettyDay(day: string, withYear = true): string {
  const d = toUTC(day);
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return withYear ? `${base} ${d.getUTCFullYear()}` : base;
}

export function weekdayDay(day: string): string {
  const d = toUTC(day);
  return `${WEEKDAYS[d.getUTCDay()]}, ${prettyDay(day)}`;
}

/** "today", "tomorrow", "in 5 days", "3 days ago". */
export function relDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 0) return `in ${n} days`;
  return `${-n} days ago`;
}

/** Compact duration for ages: "12d", "3 mo". */
export function spanLabel(days: number): string {
  const d = Math.abs(days);
  if (d < 45) return `${d} day${d === 1 ? "" : "s"}`;
  const months = Math.round(d / 30.4);
  return `${months} month${months === 1 ? "" : "s"}`;
}

export function istTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MIN * 60_000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m} ${h < 12 ? "am" : "pm"}`;
}
