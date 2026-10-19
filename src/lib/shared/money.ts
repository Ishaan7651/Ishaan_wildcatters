const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹18,500 — Indian digit grouping. */
export function rupees(n: number): string {
  return `₹${inr.format(Math.round(n))}`;
}

/** ₹1.2L / ₹45k — for dense places like map labels. */
export function rupeesShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${trim(n / 1_00_00_000)}Cr`;
  if (n >= 1_00_000) return `₹${trim(n / 1_00_000)}L`;
  if (n >= 1_000) return `₹${trim(n / 1_000)}k`;
  return `₹${Math.round(n)}`;
}

function trim(n: number) {
  return n >= 10 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, "");
}

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? "-" + ONES[n % 10] : ""}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** "Rupees eighteen thousand five hundred only" — Indian system (lakh, crore). */
export function rupeesInWords(amount: number): string {
  let n = Math.round(amount);
  if (n === 0) return "Rupees zero only";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000);
  n %= 1_00_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} thousand`);
  if (n) parts.push(belowThousand(n));
  return `Rupees ${parts.join(" ")} only`;
}
