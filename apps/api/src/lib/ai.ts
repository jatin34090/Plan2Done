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

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

export const aiEnabled = Boolean(API_KEY);

/** Calls the Claude Messages API and returns the text of the first content block. */
async function callClaude(system: string, user: string, maxTokens = 700): Promise<string | null> {
  if (!API_KEY) return null;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }]
      })
    });
    if (!response.ok) {
      console.error("Claude API error", response.status, await response.text());
      return null;
    }
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((block) => block.type === "text")?.text;
    return text?.trim() ?? null;
  } catch (error) {
    console.error("Claude API request failed", error);
    return null;
  }
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

  if (!API_KEY) return fallback;

  const system =
    "You are an assistant inside Plan2Done, a daily planning + execution journal. " +
    "Analyse the user's day and reply with STRICT JSON only, no markdown, matching: " +
    '{"narrative": string, "tomorrowSuggestion": string, "realityCheck": string}. ' +
    "narrative: 2-3 sentences comparing plan vs actual and where time went. " +
    "tomorrowSuggestion: one actionable sentence for tomorrow. " +
    "realityCheck: one honest sentence about capacity/estimation patterns.";

  const text = await callClaude(system, planContext(plan), 600);
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

/** Turns a free-text evening brain-dump into structured entries. */
export async function parseEveningEntry(text: string, plan: PlanWithDetails): Promise<ParsedEvening> {
  const heuristic: ParsedEvening = {
    completed: [],
    partial: [],
    unplanned: [],
    reason: null,
    source: "heuristic"
  };

  if (!API_KEY) {
    // Lightweight offline extraction: match goal titles mentioned in the text.
    const lower = text.toLowerCase();
    for (const goal of plan.goals) {
      if (lower.includes(goal.title.toLowerCase().slice(0, 12))) {
        if (/(partial|almost|started|didn't finish|not finish|partly)/.test(lower)) {
          heuristic.partial.push(goal.title);
        } else {
          heuristic.completed.push(goal.title);
        }
      }
    }
    return heuristic;
  }

  const system =
    "You convert a developer's free-text end-of-day note into structured data for Plan2Done. " +
    "Reply with STRICT JSON only matching: " +
    '{"completed": string[], "partial": string[], "unplanned": [{"title": string, "minutes": number}], "reason": string|null}. ' +
    "Use the provided list of planned goals to match titles where possible. " +
    "'reason' summarises why planned work slipped, or null.";

  const user = `Planned goals:\n${plan.goals
    .map((g) => `- ${g.title}`)
    .join("\n")}\n\nEnd-of-day note:\n${text}`;

  const result = await callClaude(system, user, 700);
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
  avgDailyCompleted: number
): Promise<{ items: TomorrowPlanItem[]; note: string; source: "ai" | "heuristic" }> {
  const cap = Math.max(2, Math.round(avgDailyCompleted || 4));
  const heuristicItems: TomorrowPlanItem[] = unfinished.slice(0, cap).map((goal) => ({
    title: goal.title,
    priority: goal.priority,
    expectedMinutes: goal.expectedMinutes || 60
  }));
  const heuristic = {
    items: heuristicItems,
    note: `Based on your history you finish about ${cap} goals a day, so keep tomorrow focused.`,
    source: "heuristic" as const
  };

  if (!API_KEY) return heuristic;

  const system =
    "You are a planning assistant for Plan2Done. Given unfinished goals, available time, and the user's " +
    "typical daily throughput, propose a realistic tomorrow plan. Reply with STRICT JSON only: " +
    '{"items": [{"title": string, "priority": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW", "expectedMinutes": number}], "note": string}. ' +
    "Do not overload the day beyond available time or typical throughput.";

  const user = `Available minutes tomorrow: ${availableMinutes}\nTypical goals completed per day: ${avgDailyCompleted}\nUnfinished goals:\n${unfinished
    .map((g) => `- (${g.priority}) ${g.title} [est ${g.expectedMinutes}m]`)
    .join("\n")}`;

  const result = await callClaude(system, user, 700);
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
