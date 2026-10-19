import type { AgentName } from "./types";

export interface AgentMeta {
  name: AgentName;
  title: string;
  role: string;
  glyph: string;
  color: string;
  does: string[];
  tools: string[];
}

/** The crew. Each is named after the person who did this job in a traditional trading house. */
export const AGENTS: Record<AgentName, AgentMeta> = {
  sutradhar: {
    name: "sutradhar",
    title: "Sutradhar",
    role: "Router",
    glyph: "सू",
    color: "var(--agent-sutradhar)",
    does: [
      "Hears every voice or text request",
      "Works out whether you're recording, asking, confirming or reminding",
      "Hands the request to the right agent",
    ],
    tools: ["route_request"],
  },
  munshi: {
    name: "munshi",
    title: "Munshi",
    role: "Scribe",
    glyph: "मु",
    color: "var(--agent-munshi)",
    does: [
      "Turns “Sharma owes me 2k by Diwali” into a filled slip",
      "Finds the right business even with spelling slips",
      "Works out dates like “next Friday” or “in 15 days”",
      "Matches payments to the right open slip",
    ],
    tools: ["find_business", "list_open_slips", "propose_slip", "propose_payment"],
  },
  gawah: {
    name: "gawah",
    title: "Gawah",
    role: "Witness",
    glyph: "ग",
    color: "var(--agent-gawah)",
    does: [
      "Asks the other side to confirm every new slip",
      "Understands “haan sahi hai” or “only 1,500” replies",
      "Stamps a slip once both sides agree",
    ],
    tools: ["list_slips_to_confirm", "submit_decision"],
  },
  chowkidar: {
    name: "chowkidar",
    title: "Chowkidar",
    role: "Watch",
    glyph: "चौ",
    color: "var(--agent-chowkidar)",
    does: [
      "Walks the ledger every day",
      "Takes 1 point off for every month a confirmed debt is late",
      "Flags debts about to fall due",
      "Writes a short patrol report",
    ],
    tools: ["scan_ledger", "assess_penalty", "write_report"],
  },
  dakiya: {
    name: "dakiya",
    title: "Dakiya",
    role: "Reminders",
    glyph: "डा",
    color: "var(--agent-dakiya)",
    does: [
      "Drafts polite reminders before a due date",
      "Gets firmer as a debt ages",
      "Delivers notices of lost points",
    ],
    tools: ["draft_reminder", "deliver"],
  },
  khoji: {
    name: "khoji",
    title: "Khoji",
    role: "Inquiry",
    glyph: "खो",
    color: "var(--agent-khoji)",
    does: [
      "Answers questions about any business’s score",
      "Counts pending payments and how long they’ve waited",
      "Compares businesses and ranks the market",
    ],
    tools: ["find_business", "get_trust_profile", "list_obligations", "market_overview", "my_position", "answer"],
  },
};

export const AGENT_ORDER: AgentName[] = ["sutradhar", "munshi", "gawah", "chowkidar", "dakiya", "khoji"];
