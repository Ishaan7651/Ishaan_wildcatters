// Types shared by the server (ledger, agents) and the browser (UI).

export type AgentName = "sutradhar" | "munshi" | "gawah" | "chowkidar" | "dakiya" | "khoji";

export interface Business {
  id: string;
  name: string;
  owner: string;
  category: string;
  city: string;
  market: string;
  phone: string;
  joinedOn: string;
  lat: number;
  lng: number;
  /** Set when a business was added by someone else's slip and hasn't joined yet. */
  invitedBy?: string;
}

export type Band = "excellent" | "good" | "watch" | "risky";

export interface BizLite {
  id: string;
  name: string;
  owner: string;
  city: string;
  category: string;
  score: number;
  band: Band;
}

export type SlipStatus = "awaiting" | "confirmed" | "disputed" | "countered" | "withdrawn" | "paid";

/** Where a slip stands today — derived from status + dates. */
export type Phase =
  | "awaiting"
  | "disputed"
  | "countered"
  | "withdrawn"
  | "upcoming"
  | "due_soon"
  | "due_today"
  | "overdue"
  | "payment_claimed"
  | "paid_on_time"
  | "paid_late";

export interface TimelineItem {
  at: string;
  kind: string;
  actor: string;
  text: string;
}

export interface SlipView {
  id: string;
  code: string;
  creditor: BizLite;
  debtor: BizLite;
  amount: number;
  originalAmount: number;
  dueDate: string;
  note: string;
  raisedBy: "creditor" | "debtor";
  raisedAt: string;
  source: "voice" | "text" | "form" | "seed";
  utterance?: string;
  status: SlipStatus;
  phase: Phase;
  confirmedAt?: string;
  dispute?: { reason: string; at: string; counterAmount?: number };
  payment?: { paidOn: string; amount: number; recordedBy: "creditor" | "debtor"; acknowledged: boolean; at: string };
  /** Days until due (negative once overdue). */
  daysToDue: number;
  daysOverdue: number;
  /** Days the money has been outstanding since both sides confirmed. */
  pendingDays: number;
  pointsLost: number;
  /** Date the next point drops if still unpaid. */
  nextPointOn?: string;
  reminders: { at: string; message: string; tone: string }[];
  timeline: TimelineItem[];
}

export interface Penalty {
  slipId: string;
  code: string;
  creditor: string;
  amount: number;
  dueDate: string;
  /** 1 for the first month late, 2 for the second, … */
  month: number;
  droppedOn: string;
  settled: boolean;
}

export interface ScoreSummary {
  score: number;
  band: Band;
  pointsLost: number;
  penalties: Penalty[];
}

export interface ProfileStats {
  owes: { count: number; amount: number; overdueCount: number; overdueAmount: number; oldestOverdueDays: number };
  owed: { count: number; amount: number; overdueCount: number; overdueAmount: number };
  awaitingTheirConfirmation: number;
  closedCount: number;
  onTimeRate: number | null;
  avgDaysLate: number | null;
  lifetimeVolume: number;
}

export interface Profile {
  business: Business;
  score: ScoreSummary;
  stats: ProfileStats;
  history: { day: string; score: number }[];
  owes: SlipView[];
  owed: SlipView[];
  closed: SlipView[];
}

export interface Notice {
  id: string;
  at: string;
  kind: "confirm_request" | "confirmed" | "disputed" | "countered" | "reminder" | "penalty" | "payment_claimed" | "payment_ack" | "withdrawn";
  agent?: AgentName;
  slipId: string;
  title: string;
  body: string;
}

export interface MeSummary {
  business: Business;
  score: ScoreSummary;
  stats: ProfileStats;
}

export interface AppState {
  clock: ClockInfo;
  ai: { mode: "ai" | "offline"; model: string };
  me: MeSummary;
  toConfirm: SlipView[];
  paymentsToAck: SlipView[];
  countersToReview: SlipView[];
  waitingOnOthers: SlipView[];
  dueSoon: SlipView[];
  overdueToMe: SlipView[];
  notices: Notice[];
}

export interface ClockInfo {
  today: string;
  realToday: string;
  simulated: boolean;
  nowISO: string;
}

// ---- Agents ----

export type StepKind = "route" | "think" | "tool" | "result" | "handoff" | "write" | "say" | "error";

export interface AgentStep {
  agent: AgentName;
  kind: StepKind;
  label: string;
  detail?: string;
  ms: number;
}

export interface AgentRun {
  id: string;
  agent: AgentName;
  trigger: string;
  actorId?: string;
  startedAt: string;
  simDay: string;
  durationMs: number;
  status: "ok" | "error";
  mode: "ai" | "offline";
  model?: string;
  summary: string;
  steps: AgentStep[];
  tokens?: number;
}

// ---- Bolo (universal voice/text box) ----

export type Intent = "record" | "payment" | "query" | "respond" | "remind" | "help";

export interface SlipDraft {
  direction: "they_owe_me" | "i_owe_them";
  counterparty: { id?: string; name: string; isNew: boolean; city?: string };
  alternatives: { id: string; name: string; city: string }[];
  amount: number | null;
  dueDate: string | null;
  dueAssumed: boolean;
  dueReason: string;
  note: string;
  questions: string[];
  utterance: string;
}

export interface PaymentDraft {
  slip: SlipView | null;
  candidates: SlipView[];
  paidOn: string;
  amount: number | null;
  role: "creditor" | "debtor";
  explanation: string;
}

export type AnswerCard =
  | { kind: "profile"; profile: Profile }
  | { kind: "obligations"; title: string; business: BizLite; role: "debtor" | "creditor"; slips: SlipView[] }
  | { kind: "leaderboard"; title: string; rows: (BizLite & { overdueAmount: number; pending: number })[] }
  | { kind: "position"; me: MeSummary; owes: SlipView[]; owed: SlipView[] }
  | { kind: "choices"; title: string; options: BizLite[] };

export type BoloResult =
  | { kind: "slip_draft"; draft: SlipDraft }
  | { kind: "payment_draft"; draft: PaymentDraft }
  | { kind: "answer"; speech: string; cards: AnswerCard[]; followUps: string[] }
  | { kind: "response"; applied: boolean; decision: "confirm" | "dispute" | "counter" | "unclear"; slip: SlipView | null; candidates: SlipView[]; reason?: string; counterAmount?: number; speech: string }
  | { kind: "reminder_draft"; slip: SlipView; message: string; tone: string }
  | { kind: "message"; text: string; suggestions: string[] };

export type BoloEvent =
  | { type: "step"; step: AgentStep }
  | { type: "result"; intent: Intent; result: BoloResult }
  | { type: "error"; message: string }
  | { type: "done"; runId: string; ms: number; mode: "ai" | "offline" };
