import type { DailyPlan, DailyReflection, Goal, UnplannedWork } from "@prisma/client";
import {
  buildDailyNarrative,
  buildRealityCheck,
  buildTomorrowSuggestion,
  formatMinutes
} from "./scores.js";

type PlanWithDetails = DailyPlan & {
  goals: Goal[];
  dailyReflection: DailyReflection | null;
  unplannedWork: UnplannedWork[];
};

// Provider is chosen by which key is set: OpenAI takes precedence, then Anthropic,
// otherwise the offline heuristic. Every prompt in this file asks for STRICT JSON.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
// Base URL is configurable so any OpenAI-compatible gateway (e.g. bazaarlink.ai,
// OpenRouter, a local proxy) works — set OPENAI_BASE_URL to its "/v1" endpoint.
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
// response_format:json_object is an OpenAI-native feature many gateways don't support,
// so default it ON only for official OpenAI; override with OPENAI_JSON_MODE=true|false.
const OPENAI_JSON_MODE = process.env.OPENAI_JSON_MODE
  ? process.env.OPENAI_JSON_MODE === "true"
  : OPENAI_BASE_URL.includes("api.openai.com");
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

type Provider = "openai" | "anthropic" | null;
const provider: Provider = OPENAI_API_KEY ? "openai" : ANTHROPIC_API_KEY ? "anthropic" : null;

export const aiEnabled = provider !== null;

/** Calls OpenAI Chat Completions (JSON mode) and returns the message text. */
async function callOpenAI(system: string, user: string, maxTokens: number): Promise<string | null> {
  try {
    const body: Record<string, unknown> = {
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    };
    // All callers request strict JSON; ask the model to guarantee it where supported.
    if (OPENAI_JSON_MODE) body.response_format = { type: "json_object" };

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      console.error("OpenAI API error", response.status, await response.text());
      return null;
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error("OpenAI API request failed", error);
    return null;
  }
}

/** Calls the Anthropic Messages API and returns the text of the first content block. */
async function callAnthropic(system: string, user: string, maxTokens: number): Promise<string | null> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }]
      })
    });
    if (!response.ok) {
      console.error("Anthropic API error", response.status, await response.text());
      return null;
    }
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((block) => block.type === "text")?.text;
    return text?.trim() ?? null;
  } catch (error) {
    console.error("Anthropic API request failed", error);
    return null;
  }
}

/** Dispatches to the configured provider; returns null when AI is disabled or the call fails. */
async function callLLM(system: string, user: string, maxTokens = 700): Promise<string | null> {
  if (provider === "openai") return callOpenAI(system, user, maxTokens);
  if (provider === "anthropic") return callAnthropic(system, user, maxTokens);
  return null;
}

function planContext(plan: PlanWithDetails): string {
  const goals = plan.goals
    .map(
      (goal) =>
        `- [${goal.status}] (${goal.priority}) ${goal.title} — planned ${formatMinutes(
          goal.expectedMinutes
        )}, actual ${formatMinutes(goal.actualMinutes)}${
          goal.blocker ? `, blocker: ${goal.blocker}` : ""
        }`
    )
    .join("\n");
  const unplanned = plan.unplannedWork
    .map((item) => `- ${item.title} (${formatMinutes(item.minutes)})`)
    .join("\n");
  const reflection = plan.dailyReflection
    ? Object.entries(plan.dailyReflection)
        .filter(([key, value]) => value && !["id", "dailyPlanId", "createdAt", "updatedAt"].includes(key))
        .map(([key, value]) => `- ${key}: ${value as string}`)
        .join("\n")
    : "None recorded.";

  return [
    `Date: ${plan.date.toISOString().slice(0, 10)}`,
    `Planned time: ${formatMinutes(plan.plannedMinutes)}, Actual: ${formatMinutes(
      plan.actualMinutes
    )}, Unplanned: ${formatMinutes(plan.unplannedMinutes)}`,
    `Goals:\n${goals || "None"}`,
    `Unplanned work:\n${unplanned || "None"}`,
    `Reflection notes:\n${reflection}`
  ].join("\n\n");
}

export interface DailySummaryText {
  narrative: string;
  tomorrowSuggestion: string;
  realityCheck: string;
  source: "ai" | "heuristic";
}

export async function generateDailySummary(plan: PlanWithDetails): Promise<DailySummaryText> {
  const fallback: DailySummaryText = {
    narrative: buildDailyNarrative(plan),
    tomorrowSuggestion: buildTomorrowSuggestion(plan),
    realityCheck: buildRealityCheck(plan),
    source: "heuristic"
  };

  if (!aiEnabled) return fallback;

  const system =
    "You are an assistant inside Plan2Done, a daily planning + execution journal. " +
    "Analyse the user's day and reply with STRICT JSON only, no markdown, matching: " +
    '{"narrative": string, "tomorrowSuggestion": string, "realityCheck": string}. ' +
    "narrative: 2-3 sentences comparing plan vs actual and where time went. " +
    "tomorrowSuggestion: one actionable sentence for tomorrow. " +
    "realityCheck: one honest sentence about capacity/estimation patterns.";

  const text = await callLLM(system, planContext(plan), 600);
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as Partial<DailySummaryText>;
    return {
      narrative: parsed.narrative || fallback.narrative,
      tomorrowSuggestion: parsed.tomorrowSuggestion || fallback.tomorrowSuggestion,
      realityCheck: parsed.realityCheck || fallback.realityCheck,
      source: "ai"
    };
  } catch {
    return fallback;
  }
}

export interface ParsedEvening {
  completed: string[];
  partial: string[];
  unplanned: { title: string; minutes: number }[];
  reason: string | null;
  source: "ai" | "heuristic";
}

/* --------------------- offline evening-note heuristic --------------------- */
// A no-API fallback that reads a free-text end-of-day note and maps it onto the
// day's plan. It classifies each goal on its OWN clause (not globally), and pulls
// out time-boxed unplanned work and a "why it slipped" reason.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "for", "on", "in", "with", "my", "our",
  "this", "that", "these", "those", "is", "was", "were", "be", "been", "get", "got", "up",
  "off", "out", "at", "as", "it", "its", "we", "did", "do", "done", "then", "so", "just",
  "also", "some", "all", "into", "from", "by", "about", "through"
]);

const COMPLETION_RE =
  /\b(done|finished|finish|complete|completed|completing|shipped|ship|wrapped|wrap|closed|sorted|fixed|fix|solved|solve|resolved|resolve|finalis|finaliz|nailed|cleared|clear|sent|deployed|merged|handled)\b/;
const PARTIAL_RE =
  /\b(partial|partially|partly|halfway|half|started|start|begun|began|beginning|progress|almost|nearly|underway|touched|midway|most of)\b/;
// Any negation implies the work is not actually finished.
const NEGATION_RE =
  /\b(did\s*n['’]?t|do\s*n['’]?t|does\s*n['’]?t|could\s*n['’]?t|was\s*n['’]?t|were\s*n['’]?t|have\s*n['’]?t|has\s*n['’]?t|had\s*n['’]?t|wo\s*n['’]?t|ca\s*n['’]?t|never|hardly|barely|not|no)\b/;

function significantTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Break a note into short clauses so each goal can be judged on its own words. */
function splitClauses(text: string): string[] {
  return text
    .split(/[.!?;\n,]+/)
    .flatMap((s) => s.split(/\b(?:but|however|though|although|whereas|while|because|due to|owing to)\b/i))
    // split "…and only started X" / "…and then fixed Y" but keep "signup and login" intact
    .flatMap((s) => s.split(/\band\s+(?=(?:only|just|then|barely|almost|nearly|started|could|did|made)\b)/i))
    .map((s) => s.trim())
    .filter(Boolean);
}

function classifyClause(clause: string): "COMPLETED" | "PARTIAL" {
  const c = clause.toLowerCase();
  if (NEGATION_RE.test(c)) return "PARTIAL";
  if (PARTIAL_RE.test(c)) return "PARTIAL";
  if (COMPLETION_RE.test(c)) return "COMPLETED";
  return "COMPLETED"; // a bare mention of a planned goal implies it was done
}

/** Index of the clause that best matches a goal title, or -1 if none is close enough. */
function bestClauseFor(goalTitle: string, clauses: string[]): number {
  const tokens = significantTokens(goalTitle);
  if (tokens.length === 0) return -1;
  const needed = tokens.length <= 2 ? 1 : Math.ceil(tokens.length / 2);
  let bestIdx = -1;
  let bestHits = 0;
  clauses.forEach((clause, i) => {
    const lc = clause.toLowerCase();
    const hits = tokens.filter((t) => lc.includes(t)).length;
    if (hits >= needed && hits > bestHits) {
      bestHits = hits;
      bestIdx = i;
    }
  });
  return bestIdx;
}

/** Total minutes referenced in a clause ("90 minutes", "2h", "an hour", "half an hour"). */
function parseDurationMinutes(text: string): number | null {
  const c = text.toLowerCase();
  let total = 0;
  let found = false;
  if (/\bhalf an hour\b/.test(c)) { total += 30; found = true; }
  if (/\b(?:an|a|one) hour\b/.test(c)) { total += 60; found = true; }
  if (/\b(?:a couple|couple of|couple) hours\b/.test(c)) { total += 120; found = true; }
  for (const frag of c.match(/\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours)\b/g) ?? []) {
    total += Math.round(parseFloat(frag) * 60);
    found = true;
  }
  for (const frag of c.match(/\d+\s*(?:m|min|mins|minute|minutes)\b/g) ?? []) {
    total += parseInt(frag, 10);
    found = true;
  }
  return found ? total : null;
}

const UNPLANNED_FILLER_RE =
  /\b(because|due to|since|spent|took|ate|cost|costs|burned|consumed|used up|used|ran|got|dealing with|dealt with|handling|handled|on|for|me|about|roughly|around|approximately|another|extra|also|then|had to|needed to|that|which|of|the|a|an|to|with|into|up|over)\b/g;

/** Derive a short unplanned-work title from a clause, dropping durations and filler. */
function unplannedTitle(clause: string): string | null {
  let c = clause.toLowerCase();
  c = c
    .replace(/\bhalf an hour\b/g, " ")
    .replace(/\b(?:an|a|one) hour\b/g, " ")
    .replace(/\b(?:a couple|couple of|couple) hours\b/g, " ")
    .replace(/\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours)\b/g, " ")
    .replace(/\d+\s*(?:m|min|mins|minute|minutes)\b/g, " ")
    .replace(UNPLANNED_FILLER_RE, " ");
  const words = c.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const title = words.slice(0, 6).join(" ");
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function extractReason(text: string): string | null {
  const m = text.match(/\b(?:because|due to|owing to)\b\s+(.+?)(?:[.!?;\n]|$)/i);
  if (m && m[1].trim().length > 2) {
    const r = m[1].trim();
    return r.charAt(0).toUpperCase() + r.slice(1);
  }
  if (/\bran out of time\b/i.test(text)) return "Ran out of time";
  return null;
}

/** Full offline parse: goals → completed/partial, plus unplanned work + reason. */
export function parseEveningHeuristic(text: string, goals: Goal[]): ParsedEvening {
  const clauses = splitClauses(text);
  const result: ParsedEvening = { completed: [], partial: [], unplanned: [], reason: null, source: "heuristic" };
  const claimed = new Set<number>(); // clauses already tied to a planned goal

  for (const goal of goals) {
    const idx = bestClauseFor(goal.title, clauses);
    if (idx === -1) continue;
    claimed.add(idx);
    if (classifyClause(clauses[idx]) === "PARTIAL") result.partial.push(goal.title);
    else result.completed.push(goal.title);
  }

  // Remaining clauses that mention a duration are treated as unplanned work.
  clauses.forEach((clause, i) => {
    if (claimed.has(i)) return;
    const minutes = parseDurationMinutes(clause);
    if (minutes === null) return;
    const title = unplannedTitle(clause);
    if (title) result.unplanned.push({ title, minutes });
  });

  result.reason = extractReason(text);
  return result;
}

/** Turns a free-text evening brain-dump into structured entries. */
export async function parseEveningEntry(text: string, plan: PlanWithDetails): Promise<ParsedEvening> {
  // The offline parser is the fallback for BOTH no-AI and AI-call-failure paths,
  // so a bad key / model / network never yields an empty result.
  const heuristic = parseEveningHeuristic(text, plan.goals);

  if (!aiEnabled) return heuristic;

  const system =
    "You convert a developer's free-text end-of-day note into structured data for Plan2Done. " +
    "Reply with STRICT JSON only matching: " +
    '{"completed": string[], "partial": string[], "unplanned": [{"title": string, "minutes": number}], "reason": string|null}. ' +
    "Use the provided list of planned goals to match titles where possible. " +
    "'reason' summarises why planned work slipped, or null.";

  const user = `Planned goals:\n${plan.goals
    .map((g) => `- ${g.title}`)
    .join("\n")}\n\nEnd-of-day note:\n${text}`;

  const result = await callLLM(system, user, 700);
  if (!result) return heuristic;

  try {
    const parsed = JSON.parse(result.replace(/^```json\s*|\s*```$/g, "")) as Partial<ParsedEvening>;
    return {
      completed: parsed.completed ?? [],
      partial: parsed.partial ?? [],
      unplanned: parsed.unplanned ?? [],
      reason: parsed.reason ?? null,
      source: "ai"
    };
  } catch {
    return heuristic;
  }
}

export interface TomorrowPlanItem {
  title: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  expectedMinutes: number;
}

/** Suggests a tomorrow plan from unfinished goals + available hours. */
export async function planTomorrow(
  unfinished: Goal[],
  availableMinutes: number,
  avgDailyCompleted: number,
  historyDays = 0,
  plannedToday = unfinished.length
): Promise<{ items: TomorrowPlanItem[]; note: string; source: "ai" | "heuristic" }> {
  const hasHistory = historyDays >= 3 && avgDailyCompleted > 0;
  const cap = Math.max(2, Math.round(avgDailyCompleted || 4));
  const heuristicItems: TomorrowPlanItem[] = unfinished.slice(0, cap).map((goal) => ({
    title: goal.title,
    priority: goal.priority,
    expectedMinutes: goal.expectedMinutes || 60
  }));

  // Build an honest note. Distinguish "no goals added today" from "all done" —
  // both leave `unfinished` empty, but only the latter earns "nice work".
  let note: string;
  if (unfinished.length === 0) {
    note =
      plannedToday === 0
        ? "You haven't added any goals today, so there's nothing to carry over. Add today's goals, or use the field below to add goals straight to tomorrow."
        : "No unfinished goals to carry over — nice work. Add tomorrow's top priorities when you're ready.";
  } else if (hasHistory) {
    note = `Based on your recent days you finish about ${cap} goals a day, so keep tomorrow focused.`;
  } else {
    note = "Here are your unfinished goals to start from. I'll tailor this to your pace once you've logged a few days.";
  }

  const heuristic = { items: heuristicItems, note, source: "heuristic" as const };

  // With no unfinished goals there is nothing for the LLM to schedule from, so skip
  // it entirely and return the honest note (otherwise the model replies with an
  // unhelpful "no goals were provided" message). Only call the LLM when there is
  // real work to shape into a plan.
  if (!aiEnabled || unfinished.length === 0) return heuristic;

  const system =
    "You are a planning assistant for Plan2Done. Given unfinished goals, available time, and the user's " +
    "typical daily throughput, propose a realistic tomorrow plan. Reply with STRICT JSON only: " +
    '{"items": [{"title": string, "priority": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW", "expectedMinutes": number}], "note": string}. ' +
    "Do not overload the day beyond available time or typical throughput.";

  const user = `Available minutes tomorrow: ${availableMinutes}\nTypical goals completed per day: ${avgDailyCompleted}\nUnfinished goals:\n${unfinished
    .map((g) => `- (${g.priority}) ${g.title} [est ${g.expectedMinutes}m]`)
    .join("\n")}`;

  const result = await callLLM(system, user, 700);
  if (!result) return heuristic;

  try {
    const parsed = JSON.parse(result.replace(/^```json\s*|\s*```$/g, "")) as {
      items?: TomorrowPlanItem[];
      note?: string;
    };
    return {
      items: parsed.items?.length ? parsed.items : heuristic.items,
      note: parsed.note || heuristic.note,
      source: "ai"
    };
  } catch {
    return heuristic;
  }
}
