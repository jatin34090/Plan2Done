"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatMinutes, PRIORITY_META } from "../lib/types";
import type { DailyPlan, Status } from "../lib/types";
import { RangePicker } from "../components/RangePicker";

const STATUS_LABEL: Record<Status, string> = {
  PLANNED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  PARTIAL: "Partial",
  SKIPPED: "Skipped",
  CARRIED_FORWARD: "Carried forward"
};

const STATUS_ICON: Record<Status, string> = {
  PLANNED: "⬜",
  IN_PROGRESS: "🔄",
  COMPLETED: "✅",
  PARTIAL: "◐",
  SKIPPED: "⏭️",
  CARRIED_FORWARD: "➡️"
};

export default function ActivityPage() {
  const [plans, setPlans] = useState<DailyPlan[] | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [firstDate, setFirstDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ firstDate: string | null }>("/api/analytics/range").then((r) => setFirstDate(r.firstDate)).catch(() => {});
  }, []);

  const onRangeChange = useCallback((r: { from: string; to: string }) => setRange(r), []);

  useEffect(() => {
    if (!range) return;
    setLoading(true);
    api
      .get<DailyPlan[]>(`/api/daily-plans?from=${range.from}&to=${range.to}`)
      .then(setPlans)
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [range]);

  // Only days that actually have something logged.
  const active = (plans ?? []).filter(
    (p) => p.goals.length > 0 || p.unplannedWork.length > 0 || p.timelineEvents.length > 0
  );

  return (
    <div className="dashboard">
      <section className="dayHeader">
        <div>
          <p className="eyebrow">Your journey, day by day</p>
          <h1>Activity</h1>
        </div>
        <RangePicker firstDate={firstDate} onChange={onRangeChange} initial="30" />
      </section>

      {loading && <div className="centerLoading"><div className="spinner" /></div>}

      {!loading && active.length === 0 && (
        <div className="panel"><p className="emptyNote">No activity logged in this range yet.</p></div>
      )}

      {!loading &&
        active.map((p) => {
          const completed = p.goals.filter((g) => g.status === "COMPLETED").length;
          return (
            <section className="panel activityDay" key={p.id}>
              <div className="activityDayHead">
                <div>
                  <Link href={`/day/${p.date.slice(0, 10)}`} className="activityDate">
                    {new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(p.date))}
                  </Link>
                  <span className="muted">
                    {p.goals.length} goals · {completed} done · {formatMinutes(p.actualMinutes + p.unplannedMinutes)} worked
                    {p.closedAt ? " · Closed" : ""}
                  </span>
                </div>
                {p.dailySummary && <div className="historyScore">{p.dailySummary.dailyScore}</div>}
              </div>

              <div className="activityItems">
                {p.goals.map((g) => (
                  <div className="activityItem" key={g.id}>
                    <span className="activityIcon">{STATUS_ICON[g.status]}</span>
                    <div className="activityBody">
                      <span className="activityTitle">{PRIORITY_META[g.priority].dot} {g.title}</span>
                      <span className="activityMeta">
                        {STATUS_LABEL[g.status]} · {formatMinutes(g.expectedMinutes)} planned
                        {g.actualMinutes > 0 ? ` · ${formatMinutes(g.actualMinutes)} actual` : ""}
                      </span>
                      {g.tasks.length > 0 && (
                        <ul className="viewSubtasks">
                          {g.tasks.map((t) => (
                            <li key={t.id} className={t.status === "COMPLETED" ? "done" : ""}>
                              <span className="viewSubtaskMark">{t.status === "COMPLETED" ? "✅" : "⬜"}</span>
                              <span>{t.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}

                {p.unplannedWork.map((u) => (
                  <div className="activityItem" key={u.id}>
                    <span className="activityIcon">⚡</span>
                    <div className="activityBody">
                      <span className="activityTitle">{u.title}</span>
                      <span className="activityMeta">Unplanned work · {formatMinutes(u.minutes)}</span>
                    </div>
                  </div>
                ))}

                {p.timelineEvents.map((ev) => (
                  <div className="activityItem" key={ev.id}>
                    <span className="activityIcon">🕘</span>
                    <div className="activityBody">
                      <span className="activityTitle">{ev.label}</span>
                      <span className="activityMeta">
                        {new Date(ev.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {ev.kind.toLowerCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
