// Demo market: 16 businesses across India and ~60 slips spanning the last
// ten months. Everything is placed relative to the day the lake is first
// created, so the demo always looks current.

import type { AgentRun, AgentStep, Business } from "@/lib/shared/types";
import { addDays, istDay, prettyDay } from "@/lib/shared/dates";
import { rupees } from "@/lib/shared/money";
import { penaltyDropDates } from "@/lib/shared/score";
import { confirmationMessage, reminderMessage, toneFor } from "./templates";
import type { EventDraft } from "./store";

const B = (
  id: string, name: string, owner: string, category: string, city: string, market: string,
  lat: number, lng: number, phone: string, joinedAgo: number,
) => ({ id, name, owner, category, city, market, lat, lng, phone, joinedAgo });

const BUSINESSES = [
  B("iyer-spices", "Iyer Spices", "Priya Iyer", "Spice wholesaler", "Kochi", "Mattancherry", 9.958, 76.259, "+91 98•••• 4120", 330),
  B("sharma-traders", "Sharma Traders", "Rakesh Sharma", "FMCG distributor", "Delhi", "Sadar Bazaar", 28.658, 77.211, "+91 99•••• 0817", 320),
  B("gupta-kirana", "Gupta Kirana Store", "Anil Gupta", "Kirana retail", "Jaipur", "Johari Bazaar", 26.919, 75.826, "+91 94•••• 3392", 300),
  B("patel-textiles", "Patel Textiles", "Hetal Patel", "Textile mill", "Surat", "Ring Road", 21.192, 72.84, "+91 98•••• 7781", 330),
  B("khan-hardware", "Khan Hardware", "Imran Khan", "Hardware", "Indore", "Siyaganj", 22.72, 75.86, "+91 97•••• 6604", 280),
  B("mehta-electronics", "Mehta Electronics", "Kunal Mehta", "Electronics dealer", "Mumbai", "Lamington Road", 18.963, 72.817, "+91 98•••• 1129", 320),
  B("lakshmi-agro", "Lakshmi Agro", "Lakshmi Reddy", "Agri produce trader", "Hyderabad", "Begum Bazaar", 17.375, 78.475, "+91 90•••• 5523", 260),
  B("royal-auto", "Royal Auto Parts", "Harpreet Singh", "Auto parts", "Ludhiana", "Gill Road", 30.885, 75.86, "+91 98•••• 2046", 310),
  B("das-garments", "Das Garments", "Sourav Das", "Garment maker", "Kolkata", "Burrabazar", 22.585, 88.355, "+91 93•••• 8810", 300),
  B("joshi-dairy", "Joshi Dairy", "Meera Joshi", "Dairy", "Pune", "Mandai", 18.51, 73.856, "+91 98•••• 3317", 330),
  B("ganga-packaging", "Ganga Packaging", "Neha Kapoor", "Packaging", "Delhi", "Okhla", 28.53, 77.27, "+91 99•••• 9045", 330),
  B("kaveri-coir", "Kaveri Coir Works", "Suresh Nair", "Coir products", "Alappuzha", "Mullakkal", 9.49, 76.33, "+91 94•••• 2268", 250),
  B("moti-sweets", "Moti Sweets", "Rohit Verma", "Sweet shop", "Lucknow", "Aminabad", 26.848, 80.94, "+91 97•••• 7452", 290),
  B("fernandes-bakery", "Fernandes Bakery", "Anita Fernandes", "Bakery", "Panaji", "Municipal Market", 15.497, 73.827, "+91 98•••• 6391", 200),
  B("sunrise-steel", "Sunrise Steel", "Vikas Agarwal", "Steel trader", "Raipur", "Pandri", 21.25, 81.63, "+91 99•••• 1580", 320),
  B("bose-printers", "Bose Printers", "Arindam Bose", "Printing", "Kolkata", "College Street", 22.576, 88.364, "+91 90•••• 4471", 310),
];

interface Spec {
  c: string; // creditor
  d: string; // debtor
  amt: number;
  r: number; // raised, days from today
  due: number;
  note: string;
  by?: "creditor" | "debtor";
  conf?: number | null; // confirmed (default r + 1); null = never
  paid?: number;
  payBy?: "creditor" | "debtor";
  ack?: number | null; // debtor-recorded payment acknowledged on (null = waiting)
  paidOn?: number;
  dispute?: { at: number; reason: string; counter?: number };
  withdrawn?: number;
  rem?: number[];
  src?: "voice" | "text" | "form";
  utt?: string;
}

const S = (c: string, d: string, amt: number, r: number, due: number, note: string, o: Partial<Spec> = {}): Spec => ({ c, d, amt, r, due, note, ...o });

const SLIPS: Spec[] = [
  // Sharma Traders — chronic late payer
  S("joshi-dairy", "sharma-traders", 24000, -200, -170, "Paneer & ghee, Inv 2207", { paid: -130 }),
  S("ganga-packaging", "sharma-traders", 11200, -160, -130, "Shrink-wrap rolls", { paid: -95 }),
  S("iyer-spices", "sharma-traders", 8750, -150, -120, "Haldi powder, 50 kg", { paid: -112 }),
  S("lakshmi-agro", "sharma-traders", 16000, -120, -90, "Toor dal, 20 bags", { paid: -78 }),
  S("sharma-traders", "gupta-kirana", 21000, -100, -70, "Biscuits & namkeen cartons", { paid: -72 }),
  S("iyer-spices", "sharma-traders", 18500, -77, -47, "Jeera 50 kg, Inv 1123", { rem: [-50, -40, -14], src: "voice", utt: "Sharma Traders owes me 18,500 for the jeera, 30 days" }),
  S("ganga-packaging", "sharma-traders", 9800, -105, -75, "Corrugated boxes", { rem: [-60, -20] }),
  S("joshi-dairy", "sharma-traders", 15600, -2, 28, "Festive ghee order"),
  S("sharma-traders", "gupta-kirana", 13400, -18, 12, "Diwali stock — soaps, oil"),
  S("sharma-traders", "moti-sweets", 7200, -40, -10, "Sugar 10 bags", { paid: -9 }),
  S("bose-printers", "sharma-traders", 6400, -20, 10, "Price-list printing", { conf: null, dispute: { at: -19, reason: "We never placed this order — please check the invoice number." } }),

  // Sunrise Steel — long, repeated delays
  S("royal-auto", "sunrise-steel", 46000, -220, -190, "Truck spares, Inv RA-88", { rem: [-150, -90, -30] }),
  S("mehta-electronics", "sunrise-steel", 125000, -160, -130, "CCTV + inverter install", { rem: [-100, -60] }),
  S("bose-printers", "sunrise-steel", 14000, -130, -100, "Letterheads & challan books"),
  S("ganga-packaging", "sunrise-steel", 22000, -190, -160, "Steel strapping"),
  S("mehta-electronics", "sunrise-steel", 60000, -300, -270, "Weighbridge display", { paid: -180 }),
  S("royal-auto", "sunrise-steel", 30000, -280, -250, "Forklift parts", { paid: -190 }),
  S("bose-printers", "sunrise-steel", 9000, -250, -220, "Annual calendars", { paid: -150 }),
  S("sunrise-steel", "khan-hardware", 38000, -6, 12, "TMT bars, 2 tonnes", { by: "debtor", src: "voice", utt: "I owe Sunrise Steel 38 thousand, payment in 18 days" }),
  S("sunrise-steel", "khan-hardware", 52000, -90, -60, "MS angles", { paid: -61 }),
  S("sunrise-steel", "royal-auto", 41000, -70, -40, "Sheet metal", { paid: -41 }),

  // Mehta Electronics — some delays
  S("bose-printers", "mehta-electronics", 7500, -68, -38, "Product brochures", { rem: [-30] }),
  S("ganga-packaging", "mehta-electronics", 18000, -200, -170, "Foam inserts", { paid: -120 }),
  S("ganga-packaging", "mehta-electronics", 12500, -150, -120, "Cartons", { paid: -85 }),
  S("bose-printers", "mehta-electronics", 6000, -110, -80, "Warranty cards", { paid: -60 }),
  S("mehta-electronics", "gupta-kirana", 28000, -45, -15, "Billing machine + scanner", { paid: -16 }),
  S("mehta-electronics", "das-garments", 16500, -30, 15, "Sewing-floor lighting"),

  // Das Garments
  S("patel-textiles", "das-garments", 240000, -55, -25, "Cotton fabric, 1,200 m", { rem: [-20] }),
  S("patel-textiles", "das-garments", 180000, -170, -140, "Rayon prints", { paid: -95 }),
  S("patel-textiles", "das-garments", 120000, -110, -80, "Denim, 600 m", { paid: -62 }),
  S("bose-printers", "das-garments", 8800, -90, -60, "Hang tags", { paid: -45 }),

  // Moti Sweets
  S("joshi-dairy", "moti-sweets", 8400, -50, -20, "Khoya 40 kg", { rem: [-18] }),
  S("ganga-packaging", "moti-sweets", 5000, -70, -40, "Mithai boxes"),
  S("joshi-dairy", "moti-sweets", 9600, -140, -110, "Milk, monthly", { paid: -95 }),
  S("joshi-dairy", "moti-sweets", 7000, -200, -170, "Paneer", { paid: -135 }),
  S("iyer-spices", "moti-sweets", 6200, -25, 5, "Kesar & elaichi", { src: "voice", utt: "Moti Sweets owes me 6200, due in a month" }),
  S("iyer-spices", "moti-sweets", 4000, -9, 21, "Elaichi 8 mm, 10 kg", { conf: null, dispute: { at: -8, reason: "2 kg elaichi came back — damaged in transit.", counter: 3200 } }),

  // Royal Auto Parts
  S("bose-printers", "royal-auto", 4400, -120, -90, "Job cards", { paid: -80 }),
  S("mehta-electronics", "royal-auto", 11000, -160, -130, "Diagnostics tablet", { paid: -125 }),
  S("ganga-packaging", "royal-auto", 6500, -60, -30, "Parts boxes", { paid: -25 }),
  S("khan-hardware", "royal-auto", 3600, -20, 10, "Fasteners"),
  S("royal-auto", "khan-hardware", 2500, -12, 18, "Duplicate entry", { conf: null, withdrawn: -11 }),

  // Lakshmi Agro
  S("iyer-spices", "lakshmi-agro", 12600, -32, -2, "Mirch powder, 60 kg", { paid: -1, payBy: "debtor", ack: null, paidOn: -3 }),
  S("kaveri-coir", "lakshmi-agro", 9000, -150, -120, "Coir grow bags", { paid: -110 }),
  S("ganga-packaging", "lakshmi-agro", 7800, -90, -60, "Jute sacks", { paid: -52 }),

  // Iyer Spices (the default seat)
  S("bose-printers", "iyer-spices", 2200, -170, -140, "Labels", { paid: -128 }),
  S("ganga-packaging", "iyer-spices", 12000, -19, 11, "Pouches, 5,000 pcs"),
  S("ganga-packaging", "iyer-spices", 4800, -1, 16, "Zip-lock pouches", { conf: null }),
  S("kaveri-coir", "iyer-spices", 5600, -2, 20, "Coir sacks, 400 pcs", { conf: null }),
  S("ganga-packaging", "iyer-spices", 9500, -110, -80, "Printed cartons", { paid: -82 }),
  S("iyer-spices", "gupta-kirana", 9000, -60, -30, "Garam masala packs", { paid: -32 }),
  S("iyer-spices", "gupta-kirana", 7500, -1, 10, "Sambar & rasam masala", { conf: null, src: "voice", utt: "Gupta Kirana owes me 7500 by the 30th" }),
  S("iyer-spices", "fernandes-bakery", 3400, -28, 2, "Cinnamon & nutmeg", { rem: [-1], src: "voice", utt: "Fernandes bakery owes me 3400, 30 din mein" }),

  // Others
  S("bose-printers", "kaveri-coir", 3000, -100, -70, "Export labels", { paid: -55 }),
  S("ganga-packaging", "kaveri-coir", 6600, -40, -12, "Bale wrap"),
  S("joshi-dairy", "fernandes-bakery", 4200, -40, -10, "Butter, 30 kg", { paid: -12 }),
  S("ganga-packaging", "fernandes-bakery", 2900, -15, 15, "Cake boxes"),
  S("joshi-dairy", "gupta-kirana", 6800, -30, -1, "Curd & paneer", { paid: -3 }),
  S("ganga-packaging", "joshi-dairy", 14000, -50, -20, "Milk pouches film", { paid: -22 }),
  S("bose-printers", "patel-textiles", 5200, -35, -5, "Swatch cards", { paid: -6 }),
  S("ganga-packaging", "bose-printers", 8000, -130, -100, "Paper reams", { paid: -95 }),
  S("kaveri-coir", "ganga-packaging", 4000, -60, -30, "Coir padding", { paid: -31 }),
];

function at(today: string, offset: number, hour: number, minute = 0) {
  const day = addDays(today, offset);
  return new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`).toISOString();
}

export function buildSeed(now: Date): { events: EventDraft[]; runs: AgentRun[] } {
  const today = istDay(now);
  const events: EventDraft[] = [];
  const runs: AgentRun[] = [];
  const biz = new Map<string, Business>();

  for (const b of BUSINESSES) {
    const business: Business = {
      id: b.id, name: b.name, owner: b.owner, category: b.category, city: b.city, market: b.market,
      phone: b.phone, joinedOn: addDays(today, -b.joinedAgo), lat: b.lat, lng: b.lng,
    };
    biz.set(b.id, business);
    events.push({ type: "business.registered", actor: b.id, data: { ...business }, at: at(today, -b.joinedAgo, 10) });
  }

  // Track penalty drops per debtor so penalty events can carry the running score.
  const drops: { debtor: string; slipId: string; day: string; month: number }[] = [];

  SLIPS.forEach((s, i) => {
    const slipId = `slip_seed_${i.toString().padStart(2, "0")}`;
    const code = `SKH-${(0x1a2b + i * 397).toString(16).toUpperCase().slice(-4)}`;
    const raisedBy = s.by ?? "creditor";
    const raiser = raisedBy === "creditor" ? s.c : s.d;
    const confirmer = raisedBy === "creditor" ? s.d : s.c;
    const h = 9 + (i % 9);
    const m = (i * 7) % 60;
    events.push({
      type: "slip.raised",
      actor: raiser,
      at: at(today, s.r, h, m),
      data: {
        slipId, code, creditorId: s.c, debtorId: s.d, amount: s.amt, dueDate: addDays(today, s.due), note: s.note,
        raisedBy, source: s.src ?? "seed", ...(s.utt ? { utterance: s.utt } : {}),
      },
    });
    events.push({
      type: "confirmation.requested",
      actor: "agent:gawah",
      at: at(today, s.r, h, m),
      data: {
        slipId, to: confirmer,
        message: confirmationMessage({ raiser: biz.get(raiser)!.name, amount: s.amt, dueDate: addDays(today, s.due), note: s.note, raisedBy }),
      },
    });

    if (s.dispute) {
      events.push({
        type: "slip.disputed", actor: confirmer, at: at(today, s.dispute.at, 12, 15),
        data: { slipId, by: confirmer, reason: s.dispute.reason, ...(s.dispute.counter ? { counterAmount: s.dispute.counter } : {}) },
      });
    }
    if (s.withdrawn !== undefined) {
      events.push({ type: "slip.withdrawn", actor: raiser, at: at(today, s.withdrawn, 11, 5), data: { slipId, by: raiser } });
    }

    const conf = s.conf === undefined ? s.r + 1 : s.conf;
    if (conf === null) return;
    events.push({ type: "slip.confirmed", actor: confirmer, at: at(today, conf, 18, (i * 11) % 60), data: { slipId, by: confirmer } });

    const dueDate = addDays(today, s.due);
    for (const r of s.rem ?? []) {
      const tone = toneFor(s.due - r);
      events.push({
        type: "reminder.sent", actor: "agent:dakiya", at: at(today, r, 9, 30),
        data: {
          slipId, from: s.c, to: s.d, tone, agent: "dakiya",
          message: reminderMessage({ creditor: biz.get(s.c)!.name, debtorOwner: biz.get(s.d)!.owner, amount: s.amt, dueDate, today: addDays(today, r), note: s.note }),
        },
      });
    }

    let settled: string | null = null;
    if (s.paid !== undefined) {
      const payBy = s.payBy ?? "creditor";
      const paidOn = addDays(today, s.paidOn ?? s.paid);
      events.push({
        type: "payment.recorded", actor: payBy === "creditor" ? s.c : s.d, at: at(today, s.paid, 16, 40),
        data: { slipId, by: payBy === "creditor" ? s.c : s.d, role: payBy, paidOn, amount: s.amt },
      });
      if (payBy === "debtor" && s.ack != null) {
        events.push({ type: "payment.acknowledged", actor: s.c, at: at(today, s.ack, 17, 10), data: { slipId, by: s.c } });
      }
      if (payBy === "creditor" || s.ack != null) settled = paidOn;
    }
    penaltyDropDates(dueDate, settled ?? addDays(today, -1)).forEach((day, k) =>
      drops.push({ debtor: s.d, slipId, day, month: k + 1 }),
    );
  });

  drops.sort((a, b) => (a.day < b.day ? -1 : 1));
  const running = new Map<string, number>();
  for (const p of drops) {
    const score = (running.get(p.debtor) ?? 100) - 1;
    running.set(p.debtor, score);
    // Stamped at 6am IST on the day the point dropped — when Chowkidar walks.
    events.push({
      type: "penalty.assessed", actor: "agent:chowkidar", at: new Date(`${p.day}T06:00:00+05:30`).toISOString(),
      data: { slipId: p.slipId, debtorId: p.debtor, month: p.month, droppedOn: p.day, scoreAfter: score, agent: "chowkidar" },
    });
  }

  // A few past agent runs so the diary has history from day one.
  let runSeq = 0;
  const run = (agent: AgentRun["agent"], offset: number, hour: number, trigger: string, summary: string, steps: [AgentStep["kind"], string, string?][], actorId?: string, ms = 1800): AgentRun => ({
    id: `run_seed_${runSeq++}`,
    agent,
    trigger,
    actorId,
    startedAt: at(today, offset, hour, 2),
    simDay: addDays(today, offset),
    durationMs: ms,
    status: "ok",
    mode: "ai",
    summary,
    steps: steps.map(([kind, label, detail], j) => ({ agent, kind, label, detail, ms: Math.round((ms / steps.length) * j) })),
  });

  for (const off of [-3, -2, -1]) {
    const day = addDays(today, off);
    const dropped = drops.filter((p) => p.day === day);
    const overdue = SLIPS.filter((s) => s.conf !== null && s.due < off && (s.paid === undefined || s.paid > off)).length;
    runs.push(
      run("chowkidar", off, 6, "Daily patrol", dropped.length
        ? `Walked the ledger for ${prettyDay(day, false)}: ${overdue} debts overdue, ${dropped.length} point${dropped.length > 1 ? "s" : ""} taken off.`
        : `Walked the ledger for ${prettyDay(day, false)}: ${overdue} debts overdue, no new points lost today.`,
      [
        ["tool", "scan_ledger", `${SLIPS.length} slips checked`],
        ["think", `${overdue} confirmed debts are past due`],
        ...dropped.map((p) => ["write", `assess_penalty · ${biz.get(p.debtor)!.name}`, `month ${p.month} late`] as [AgentStep["kind"], string, string]),
        ["say", "Patrol report filed"],
      ], undefined, 2400),
    );
  }

  runs.push(
    run("munshi", -28, 11, "Voice · Iyer Spices", `Drafted a slip: Fernandes Bakery owes ${rupees(3400)}, due ${prettyDay(addDays(today, 2), false)}.`, [
      ["route", "Sutradhar → Munshi", "Recording a new debt"],
      ["tool", "find_business(\"fernandes bakery\")", "Fernandes Bakery · Panaji · 0.97"],
      ["think", "“30 din mein” → 30 days from today"],
      ["write", "propose_slip", "₹3,400 · they owe me"],
    ], "iyer-spices", 2100),
    run("khoji", -5, 15, "Voice · Iyer Spices", "Answered: Sharma Traders' score and their 3 open payments.", [
      ["route", "Sutradhar → Khoji", "Question about another business"],
      ["tool", "find_business(\"sharma\")", "Sharma Traders · Delhi · 0.95"],
      ["tool", "get_trust_profile(sharma-traders)", "score, penalties, stats"],
      ["tool", "list_obligations(sharma-traders, debtor, pending)", "open debts"],
      ["say", "answer", "Score and pending payments, read aloud"],
    ], "iyer-spices", 3200),
    run("dakiya", -14, 9, "Overdue · SKH slip", "Sent a firm reminder to Sharma Traders for ₹18,500.", [
      ["tool", "draft_reminder", "33 days overdue → firm tone"],
      ["write", "deliver → Sharma Traders"],
    ], "iyer-spices", 1400),
    run("dakiya", -1, 9, "Due soon", "Sent a gentle reminder to Fernandes Bakery — ₹3,400 due in 3 days.", [
      ["tool", "draft_reminder", "due in 3 days → gentle tone"],
      ["write", "deliver → Fernandes Bakery"],
    ], "iyer-spices", 1200),
    run("gawah", -1, 14, "New slip", "Asked Iyer Spices to confirm ₹4,800 from Ganga Packaging.", [
      ["tool", "compose_request", "Ganga Packaging → Iyer Spices"],
      ["write", "deliver → Iyer Spices"],
    ], "ganga-packaging", 900),
  );

  return { events, runs: runs.sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)) };
}
