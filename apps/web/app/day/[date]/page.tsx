"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePlan } from "../../lib/usePlan";
import { formatMinutes, PRIORITY_META } from "../../lib/types";
import type { Status } from "../../lib/types";

function statusSentence(status: Status) {
  const labels: Record<Status, string> = {
    PLANNED: "Not started",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    PARTIAL: "Partially completed",
    SKIPPED: "Skipped",
    CARRIED_FORWARD: "Carried forward"
  };
  return labels[status];
}

export default function DayPage() {
  const params = useParams<{ date: string }>();
  const { plan, loading, error } = usePlan(params.date);

  if (loading) return <div className="pagePad"><div className="spinner" /></div>;
  if (error || !plan) return <div className="pagePad"><p className="formError">{error ?? "Not found"}</p></div>;

  const completed = plan.goals.filter((g) => g.status === "COMPLETED").length;

  return (
    <div className="dashboard">
      <section className="dayHeader">
        <div>
          <Link href="/history" className="backLink"><ArrowLeft size={16} /> History</Link>
          <h1>{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(plan.date))}</h1>
          <p className="eyebrow">{plan.goals.length} goals · {completed} completed · {formatMinutes(plan.actualMinutes + plan.unplannedMinutes)} worked{plan.closedAt ? " · Closed" : ""}</p>
        </div>
        {plan.dailySummary && <div className="scoreCircle small"><span>{plan.dailySummary.dailyScore}</span><small>/100</small></div>}
      </section>

      {plan.whyTodayMatters && <div className="panel"><p className="why">{plan.whyTodayMatters}</p></div>}

      {plan.dailySummary && (
        <section className="insightGrid">
          <div className="insight"><h3>Summary</h3><p>{plan.dailySummary.narrative}</p></div>
          {plan.dailySummary.realityCheck && <div className="insight"><h3>Reality Check</h3><p>{plan.dailySummary.realityCheck}</p></div>}
          {plan.dailySummary.tomorrowSuggestion && <div className="insight"><h3>Next</h3><p>{plan.dailySummary.tomorrowSuggestion}</p></div>}
        </section>
      )}

      <section className="panel">
        <div className="panelHeadRow"><h2>Planned vs Actual</h2></div>
        <div className="comparisonTable">
          <div className="tableHead"><span>Goal</span><span>Planned</span><span>Actual</span></div>
          {plan.goals.map((g) => (
            <div className="comparisonRow" key={g.id}>
              <div>
                <strong>{PRIORITY_META[g.priority].dot} {g.title}</strong>
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
              <p>{g.plannedOutcome ?? "—"}<br /><span>{formatMinutes(g.expectedMinutes)}</span></p>
              <p>{g.actualOutcome ?? statusSentence(g.status)}<br /><span>{formatMinutes(g.actualMinutes)}</span></p>
            </div>
          ))}
        </div>
      </section>

      {plan.unplannedWork.length > 0 && (
        <section className="panel">
          <div className="panelHeadRow"><h2>Unplanned Work</h2></div>
          <div className="unplannedList">
            {plan.unplannedWork.map((u) => (
              <div key={u.id} className="unplannedRow"><strong>{u.title}</strong><span>{formatMinutes(u.minutes)}</span></div>
            ))}
          </div>
        </section>
      )}

      {plan.dailyReflection && (
        <section className="panel">
          <div className="panelHeadRow"><h2>Reflection</h2></div>
          <div className="reflectionView">
            {plan.dailyReflection.accomplishments && <p><strong>Accomplished:</strong> {plan.dailyReflection.accomplishments}</p>}
            {plan.dailyReflection.incompleteWork && <p><strong>Incomplete:</strong> {plan.dailyReflection.incompleteWork}</p>}
            {plan.dailyReflection.incompleteReason && <p><strong>Why:</strong> {plan.dailyReflection.incompleteReason}</p>}
            {plan.dailyReflection.unexpectedWork && <p><strong>Unexpected:</strong> {plan.dailyReflection.unexpectedWork}</p>}
            {plan.dailyReflection.lesson && <p><strong>Lesson:</strong> {plan.dailyReflection.lesson}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
