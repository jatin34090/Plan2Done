"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { CarryReason, DailyPlan, Priority, Status } from "./types";

export function usePlan(dateParam?: string) {
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const withRefresh = useCallback(
    async <T>(op: Promise<T>): Promise<T> => {
      const result = await op;
      await refresh();
      return result;
    },
    [refresh]
  );

  const actions = {
    refresh,
    updatePlan: (data: { whyTodayMatters?: string; stage?: string }) =>
      withRefresh(api.patch(`/api/daily-plans/${plan!.id}`, data)),
    addGoal: (data: { title: string; priority: Priority; expectedMinutes: number; plannedOutcome?: string; importance?: string }) =>
      withRefresh(api.post(`/api/daily-plans/${plan!.id}/goals`, data)),
    updateGoal: (goalId: string, data: Partial<{ title: string; status: Status; priority: Priority; expectedMinutes: number; actualMinutes: number; plannedOutcome: string; actualOutcome: string; blocker: string; importance: string }>) =>
      withRefresh(api.patch(`/api/daily-plans/goals/${goalId}`, data)),
    deleteGoal: (goalId: string) => withRefresh(api.delete(`/api/daily-plans/goals/${goalId}`)),
    carryForward: (goalId: string, reason: CarryReason, targetDate: string) =>
      withRefresh(api.post(`/api/daily-plans/goals/${goalId}/carry-forward`, { reason, targetDate })),
    addSubtask: (goalId: string, title: string) =>
      withRefresh(api.post(`/api/daily-plans/goals/${goalId}/tasks`, { title })),
    updateSubtask: (taskId: string, data: { status?: Status; title?: string }) =>
      withRefresh(api.patch(`/api/daily-plans/tasks/${taskId}`, data)),
    deleteSubtask: (taskId: string) => withRefresh(api.delete(`/api/daily-plans/tasks/${taskId}`)),
    addUnplanned: (data: { title: string; minutes: number; notes?: string }) =>
      withRefresh(api.post(`/api/daily-plans/${plan!.id}/unplanned-work`, data)),
    deleteUnplanned: (id: string) => withRefresh(api.delete(`/api/daily-plans/unplanned-work/${id}`)),
    addTimeline: (data: { label: string; kind?: string; minutes?: number; time?: string }) =>
      withRefresh(api.post(`/api/daily-plans/${plan!.id}/timeline`, data)),
    saveReflection: (data: Record<string, string>) =>
      withRefresh(api.post(`/api/daily-plans/${plan!.id}/reflection`, data)),
    closeDay: (overallRating?: number) =>
      withRefresh(api.post(`/api/daily-plans/${plan!.id}/close`, { overallRating })),
    regenerateSummary: () =>
      withRefresh(api.post(`/api/daily-plans/${plan!.id}/ai-summary`)),
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
