export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Status =
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "PARTIAL"
  | "SKIPPED"
  | "CARRIED_FORWARD";
export type CarryReason =
  | "NOT_ENOUGH_TIME"
  | "LOW_PRIORITY"
  | "BLOCKED"
  | "UNEXPECTED_WORK"
  | "TOO_LARGE"
  | "NO_LONGER_RELEVANT";

export interface GoalTask {
  id: string;
  title: string;
  status: Status;
  parentId: string | null;
  order: number;
}

export interface TimeEntry {
  id: string;
  label: string;
  minutes: number;
  kind: string;
}

export interface Goal {
  id: string;
  dailyPlanId: string;
  title: string;
  plannedOutcome?: string | null;
  actualOutcome?: string | null;
  priority: Priority;
  status: Status;
  expectedMinutes: number;
  actualMinutes: number;
  importance?: string | null;
  blocker?: string | null;
  carryForwardReason?: CarryReason | null;
  tasks: GoalTask[];
  timeEntries: TimeEntry[];
}

export interface UnplannedWork {
  id: string;
  title: string;
  minutes: number;
  notes?: string | null;
}

export interface TimelineEvent {
  id: string;
  label: string;
  time: string;
  kind: string;
  minutes?: number | null;
}

export interface DailyReflection {
  accomplishments?: string | null;
  incompleteWork?: string | null;
  incompleteReason?: string | null;
  unexpectedWork?: string | null;
  lesson?: string | null;
  biggestAchievement?: string | null;
  biggestBlocker?: string | null;
  moveToTomorrow?: string | null;
}

export interface DailySummary {
  completionRate: number;
  dailyScore: number;
  priorityScore: number;
  estimationScore: number;
  reflectionScore: number;
  narrative: string;
  tomorrowSuggestion?: string | null;
  realityCheck?: string | null;
}

export interface DailyPlan {
  id: string;
  date: string;
  stage: string;
  whyTodayMatters?: string | null;
  plannedMinutes: number;
  actualMinutes: number;
  unplannedMinutes: number;
  overallRating?: number | null;
  closedAt?: string | null;
  goals: Goal[];
  unplannedWork: UnplannedWork[];
  timelineEvents: TimelineEvent[];
  dailyReflection?: DailyReflection | null;
  dailySummary?: DailySummary | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  timezone: string;
}

export const PRIORITY_META: Record<Priority, { label: string; dot: string; color: string }> = {
  CRITICAL: { label: "Critical", dot: "🔴", color: "var(--critical)" },
  HIGH: { label: "High", dot: "🟠", color: "var(--high)" },
  MEDIUM: { label: "Medium", dot: "🟡", color: "var(--medium)" },
  LOW: { label: "Low", dot: "🟢", color: "var(--low)" }
};

export const CARRY_REASONS: { value: CarryReason; label: string }[] = [
  { value: "NOT_ENOUGH_TIME", label: "Not enough time" },
  { value: "LOW_PRIORITY", label: "Low priority" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "UNEXPECTED_WORK", label: "Unexpected work" },
  { value: "TOO_LARGE", label: "Task was too large" },
  { value: "NO_LONGER_RELEVANT", label: "No longer relevant" }
];

/** Local YYYY-MM-DD for today + offsetDays (uses local calendar date, not UTC). */
export function dateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/* ---------- date range presets (reports + activity) ---------- */

export type RangePreset = "7" | "30" | "90" | "month" | "year" | "all" | "custom";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" }
];

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Resolve a preset to concrete { from, to } YYYY-MM-DD strings. `firstDate` powers "all time". */
export function resolveRange(preset: RangePreset, firstDate?: string | null): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  if (preset === "month") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (preset === "year") return { from: ymd(new Date(now.getFullYear(), 0, 1)), to };
  if (preset === "all") return { from: firstDate ? firstDate.slice(0, 10) : ymd(new Date(now.getFullYear(), 0, 1)), to };
  if (preset === "7" || preset === "30" || preset === "90") {
    const from = new Date(now);
    from.setDate(from.getDate() - (Number(preset) - 1));
    return { from: ymd(from), to };
  }
  // custom: caller supplies its own dates; return a sensible default (last 30 days)
  const from = new Date(now);
  from.setDate(from.getDate() - 29);
  return { from: ymd(from), to };
}
