"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { dateStr } from "./types";
import type { CarryReason, DailyPlan, Priority, Status } from "./types";

/** Recompute the roll-up totals so progress/score update instantly on optimistic edits. */
function recompute(plan: DailyPlan): DailyPlan {
  return {
    ...plan,
    plannedMinutes: plan.goals.reduce((s, g) => s + (g.expectedMinutes || 0), 0),
    actualMinutes: plan.goals.reduce((s, g) => s + (g.actualMinutes || 0), 0),
    unplannedMinutes: plan.unplannedWork.reduce((s, u) => s + (u.minutes || 0), 0)
  };
}

type GoalPatch = Partial<{
  title: string;
  status: Status;
  priority: Priority;
  expectedMinutes: number;
  actualMinutes: number;
  plannedOutcome: string;
  actualOutcome: string;
  blocker: string;
  importance: string;
}>;

export function usePlan(dateParam?: string) {
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  const path = dateParam ? `/api/daily-plans/${dateParam}` : "/api/daily-plans/today";

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<DailyPlan>(path);
      setPlan(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // Run a network op while tracking in-flight count, then reconcile with the server.
  const run = useCallback(
    async <T>(op: Promise<T>, reconcile = true): Promise<T> => {
      setPending((p) => p + 1);
      try {
        const result = await op;
        if (reconcile) await refresh();
        return result;
      } finally {
        setPending((p) => p - 1);
      }
    },
    [refresh]
  );

  // Apply an instant local change, then fire the network op in the background.
  const optimistic = useCallback(
    <T>(mutate: (p: DailyPlan) => DailyPlan, op: Promise<T>): Promise<T> => {
      setPlan((prev) => (prev ? recompute(mutate(prev)) : prev));
      return run(op);
    },
    [run]
  );

  const actions = {
    refresh,
    busy: pending > 0,
    updatePlan: (data: { whyTodayMatters?: string; stage?: string }) =>
      optimistic((p) => ({ ...p, ...data }), api.patch(`/api/daily-plans/${plan!.id}`, data)),
    addGoal: (data: { title: string; priority: Priority; expectedMinutes: number; plannedOutcome?: string; importance?: string }) =>
      run(api.post(`/api/daily-plans/${plan!.id}/goals`, data)),
    updateGoal: (goalId: string, data: GoalPatch) =>
      optimistic(
        (p) => ({ ...p, goals: p.goals.map((g) => (g.id === goalId ? { ...g, ...data } : g)) }),
        api.patch(`/api/daily-plans/goals/${goalId}`, data)
      ),
    deleteGoal: (goalId: string) =>
      optimistic(
        (p) => ({ ...p, goals: p.goals.filter((g) => g.id !== goalId) }),
        api.delete(`/api/daily-plans/goals/${goalId}`)
      ),
    carryForward: (goalId: string, reason: CarryReason, targetDate: string) =>
      optimistic(
        (p) => ({ ...p, goals: p.goals.map((g) => (g.id === goalId ? { ...g, status: "CARRIED_FORWARD" } : g)) }),
        api.post(`/api/daily-plans/goals/${goalId}/carry-forward`, { reason, targetDate })
      ),
    addSubtask: (goalId: string, title: string) =>
      run(api.post(`/api/daily-plans/goals/${goalId}/tasks`, { title })),
    updateSubtask: (taskId: string, data: { status?: Status; title?: string }) =>
      optimistic(
        (p) => ({
          ...p,
          goals: p.goals.map((g) => ({
            ...g,
            tasks: g.tasks.map((t) => (t.id === taskId ? { ...t, ...data } : t))
          }))
        }),
        api.patch(`/api/daily-plans/tasks/${taskId}`, data)
      ),
    deleteSubtask: (taskId: string) =>
      optimistic(
        (p) => ({ ...p, goals: p.goals.map((g) => ({ ...g, tasks: g.tasks.filter((t) => t.id !== taskId) })) }),
        api.delete(`/api/daily-plans/tasks/${taskId}`)
      ),
    addUnplanned: (data: { title: string; minutes: number; notes?: string }) =>
      run(api.post(`/api/daily-plans/${plan!.id}/unplanned-work`, data)),
    deleteUnplanned: (id: string) =>
      optimistic(
        (p) => ({ ...p, unplannedWork: p.unplannedWork.filter((u) => u.id !== id) }),
        api.delete(`/api/daily-plans/unplanned-work/${id}`)
      ),
    addTimeline: (data: { label: string; kind?: string; minutes?: number; time?: string }) =>
      run(api.post(`/api/daily-plans/${plan!.id}/timeline`, data)),
    saveReflection: (data: Record<string, string>) =>
      run(api.post(`/api/daily-plans/${plan!.id}/reflection`, data)),
    closeDay: (overallRating?: number) =>
      run(api.post(`/api/daily-plans/${plan!.id}/close`, { overallRating })),
    regenerateSummary: () => run(api.post(`/api/daily-plans/${plan!.id}/ai-summary`)),
    // Create goals on tomorrow's plan (creating that plan if needed). Returns the date.
    addGoalsToTomorrow: (goals: { title: string; priority: Priority; expectedMinutes: number }[]) => {
      const ds = dateStr(1);
      return run(
        (async () => {
          const tomorrow = await api.get<DailyPlan>(`/api/daily-plans/${ds}`);
          for (const g of goals) {
            await api.post(`/api/daily-plans/${tomorrow.id}/goals`, g);
          }
          return ds;
        })(),
        false
      );
    },
    parseEvening: (text: string, apply: boolean) =>
      api.post<{ completed: string[]; partial: string[]; unplanned: { title: string; minutes: number }[]; reason: string | null; source: string }>(
        `/api/daily-plans/${plan!.id}/parse-evening`,
        { text, apply }
      ),
    planTomorrow: (availableMinutes: number) =>
      api.post<{ items: { title: string; priority: Priority; expectedMinutes: number }[]; note: string; source: string }>(
        `/api/daily-plans/${plan!.id}/plan-tomorrow`,
        { availableMinutes }
      )
  };

  return { plan, loading, error, actions };
}
