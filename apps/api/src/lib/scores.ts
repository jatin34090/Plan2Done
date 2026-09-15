import type { DailyPlan, DailyReflection, Goal, GoalPriority, GoalStatus, UnplannedWork } from "@prisma/client";

type PlanWithDetails = DailyPlan & {
  goals: Goal[];
  dailyReflection: DailyReflection | null;
  unplannedWork: UnplannedWork[];
};

const priorityWeight: Record<GoalPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

const completionValue: Record<GoalStatus, number> = {
  COMPLETED: 1,
  PARTIAL: 0.5,
  IN_PROGRESS: 0.35,
  CARRIED_FORWARD: 0.25,
  PLANNED: 0,
  SKIPPED: 0
};

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function calculateCompletionRate(goals: Goal[]) {
  if (goals.length === 0) return 0;
  const completed = goals.reduce((sum, goal) => sum + completionValue[goal.status], 0);
  return clampScore((completed / goals.length) * 100);
}

export function calculatePriorityScore(goals: Goal[]) {
  const totalWeight = goals.reduce((sum, goal) => sum + priorityWeight[goal.priority], 0);
  if (totalWeight === 0) return 0;
  const completedWeight = goals.reduce((sum, goal) => {
    return sum + priorityWeight[goal.priority] * completionValue[goal.status];
  }, 0);
  return clampScore((completedWeight / totalWeight) * 100);
}

export function calculateEstimationScore(plannedMinutes: number, actualMinutes: number) {
  if (plannedMinutes === 0 && actualMinutes === 0) return 100;
  if (plannedMinutes === 0) return 40;
  const variance = Math.abs(actualMinutes - plannedMinutes) / plannedMinutes;
  return clampScore(100 - variance * 100);
}

export function calculateReflectionScore(reflection: DailyReflection | null) {
  if (!reflection) return 0;
  const fields = [
    reflection.accomplishments,
    reflection.incompleteWork,
    reflection.incompleteReason,
    reflection.unexpectedWork,
    reflection.lesson,
    reflection.biggestAchievement,
    reflection.biggestBlocker
  ];
  const filled = fields.filter(Boolean).length;
  return clampScore((filled / fields.length) * 100);
}

export function calculateDailyScore(plan: PlanWithDetails) {
  const completionScore = calculateCompletionRate(plan.goals);
  const priorityScore = calculatePriorityScore(plan.goals);
  const estimationScore = calculateEstimationScore(plan.plannedMinutes, plan.actualMinutes);
  const reflectionScore = calculateReflectionScore(plan.dailyReflection);

  return {
    completionScore,
    priorityScore,
    estimationScore,
    reflectionScore,
    dailyScore: clampScore(
      completionScore * 0.4 +
      priorityScore * 0.25 +
      estimationScore * 0.2 +
      reflectionScore * 0.15
    )
  };
}

export function buildDailyNarrative(plan: PlanWithDetails) {
  const completed = plan.goals.filter((goal) => goal.status === "COMPLETED").length;
  const partial = plan.goals.filter((goal) => goal.status === "PARTIAL" || goal.status === "IN_PROGRESS").length;
  const unfinished = plan.goals.filter((goal) => goal.status === "PLANNED" || goal.status === "SKIPPED").length;
  const topPriority = [...plan.goals].sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority])[0];
  const unplannedMinutes = plan.unplannedWork.reduce((sum, item) => sum + item.minutes, 0);

  const parts = [
    `You planned ${plan.goals.length} goals and completed ${completed}.`,
    partial > 0 ? `${partial} goal${partial === 1 ? " was" : "s were"} partially completed or still in progress.` : "",
    unfinished > 0 ? `${unfinished} goal${unfinished === 1 ? " was" : "s were"} left incomplete.` : "",
    topPriority ? `Your highest-priority focus was "${topPriority.title}".` : "",
    unplannedMinutes > 0 ? `Unplanned work took ${formatMinutes(unplannedMinutes)}, which explains part of the gap between plan and actual.` : ""
  ];

  return parts.filter(Boolean).join(" ");
}

export function buildRealityCheck(plan: PlanWithDetails) {
  const planned = plan.plannedMinutes;
  const actual = plan.actualMinutes + plan.unplannedMinutes;
  if (planned === 0) return "Add time estimates in the morning so Plan2Done can compare intent against reality.";
  if (actual > planned * 1.25) return "Today ran materially over plan. Tomorrow, reduce planned scope or reserve a buffer for unexpected work.";
  if (actual < planned * 0.75) return "Actual work was well below planned time. Check whether estimates were too high or priorities changed.";
  return "Your planned time and actual time were reasonably close today.";
}

export function buildTomorrowSuggestion(plan: PlanWithDetails) {
  const carryForward = plan.goals.filter((goal) => goal.status !== "COMPLETED").slice(0, 3);
  if (carryForward.length === 0) return "Start tomorrow with fresh priorities and keep the plan intentionally small.";
  return `Start tomorrow with: ${carryForward.map((goal) => goal.title).join(", ")}.`;
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
