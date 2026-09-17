"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flame,
  Moon,
  Plus,
  Sparkles,
  Target,
  Wand2
} from "lucide-react";
import { api } from "./lib/api";
import { usePlan } from "./lib/usePlan";
import { formatMinutes, PRIORITY_META } from "./lib/types";
import type { Priority, Status } from "./lib/types";
import { GoalItem } from "./components/GoalItem";
import { ClosureDialog } from "./components/ClosureDialog";

const STATUS_VALUE: Record<Status, number> = {
  COMPLETED: 1,
  PARTIAL: 0.5,
  IN_PROGRESS: 0.35,
  CARRIED_FORWARD: 0.25,
  PLANNED: 0,
  SKIPPED: 0
};

interface StreakData {
  streak: number;
  typicalCompleted: number | null;
  todayPlanned: number;
  realityCheck: string | null;
}

export default function DashboardPage() {
  const { plan, loading, error, actions } = usePlan();
  const [showClosure, setShowClosure] = useState(false);
  const [streak, setStreak] = useState<StreakData | null>(null);

  // add-goal form
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [minutes, setMinutes] = useState(60);

  // AI helpers
  const [eveningText, setEveningText] = useState("");
  const [eveningResult, setEveningResult] = useState<string | null>(null);
  const [tomorrow, setTomorrow] = useState<{ items: { title: string; priority: Priority; expectedMinutes: number }[]; note: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    api.get<StreakData>("/api/analytics/streak").then(setStreak).catch(() => {});
  }, [plan?.goals.length]);

  if (loading) return <div className="pagePad"><div className="spinner" /></div>;
  if (error || !plan) return <div className="pagePad"><p className="formError">{error ?? "No plan"}</p></div>;

  const locked = Boolean(plan.closedAt);
  const completedValue = plan.goals.reduce((s, g) => s + STATUS_VALUE[g.status], 0);
  const progress = plan.goals.length ? Math.round((completedValue / plan.goals.length) * 100) : 0;
  const score = plan.dailySummary?.dailyScore ?? Math.round(progress * 0.8 + 20);
  const actualTotal = plan.actualMinutes + plan.unplannedMinutes;

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await actions.addGoal({ title: title.trim(), priority, expectedMinutes: minutes });
    setTitle("");
    setPriority("MEDIUM");
    setMinutes(60);
  }

  async function runEvening(apply: boolean) {
    if (!eveningText.trim()) return;
    setAiBusy(true);
    try {
      const res = await actions.parseEvening(eveningText.trim(), apply);
      const parts = [
        res.completed.length ? `Completed: ${res.completed.join(", ")}` : "",
        res.partial.length ? `Partial: ${res.partial.join(", ")}` : "",
        res.unplanned.length ? `Unplanned: ${res.unplanned.map((u) => `${u.title} (${u.minutes}m)`).join(", ")}` : "",
        res.reason ? `Reason: ${res.reason}` : ""
      ].filter(Boolean);
      setEveningResult(parts.length ? `${apply ? "Applied. " : ""}${parts.join(" · ")} (${res.source})` : "Nothing matched.");
      if (apply) await actions.refresh();
    } finally {
      setAiBusy(false);
    }
  }

  async function runTomorrow() {
    setAiBusy(true);
    try {
      const res = await actions.planTomorrow(360);
      setTomorrow(res);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <section className="dayHeader">
        <div>
          <p className="eyebrow">{formatLongDate(plan.date)}{locked && " · Closed"}</p>
          <h1>Today&apos;s Plan</h1>
        </div>
        <div className="headerActions">
          {!locked && (
            <button className="primaryButton" onClick={() => setShowClosure(true)}>
              <Moon size={16} /> Close day
            </button>
          )}
          {streak && streak.streak > 0 && (
            <div className="streakBadge"><Flame size={16} /> {streak.streak}-day streak</div>
          )}
        </div>
      </section>

      {streak?.realityCheck && (
        <div className="realityBanner"><AlertTriangle size={16} /> {streak.realityCheck}</div>
      )}

      {/* Progress + score */}
      <section className="statRow">
        <div className="panel progressPanel">
          <div className="panelHeadRow">
            <h2>Today&apos;s Progress</h2>
            <strong className="bigPct">{progress}%</strong>
          </div>
          <div className="progressTrack"><span style={{ width: `${progress}%` }} /></div>
          <textarea
            className="whyInput"
            defaultValue={plan.whyTodayMatters ?? ""}
            placeholder="Why does today matter? What's the highest-leverage outcome?"
            disabled={locked}
            onBlur={(e) => {
              if (e.target.value !== (plan.whyTodayMatters ?? "")) actions.updatePlan({ whyTodayMatters: e.target.value });
            }}
          />
          <div className="miniStats">
            <span><Target size={14} /> {plan.goals.length} goals</span>
            <span><Clock3 size={14} /> {formatMinutes(plan.plannedMinutes)} planned</span>
            <span><Activity size={14} /> {formatMinutes(actualTotal)} actual</span>
          </div>
        </div>

        <div className="panel scorePanel">
          <div className="scoreCircle" style={{ ["--score" as string]: score }}>
            <span>{score}</span><small>/100</small>
          </div>
          <h2>Daily Score</h2>
          <div className="scoreRows">
            <Metric label="Goals completed" value={plan.dailySummary?.completionRate ?? progress} />
            <Metric label="Priority goals" value={plan.dailySummary?.priorityScore ?? 0} />
            <Metric label="Time estimation" value={plan.dailySummary?.estimationScore ?? 0} />
            <Metric label="Reflection" value={plan.dailySummary?.reflectionScore ?? 0} />
          </div>
        </div>
      </section>

      {/* Goals */}
      <section className="panel">
        <div className="panelHeadRow">
          <h2><Target size={18} /> Goals</h2>
        </div>
        <div className="goalList">
          {plan.goals.length === 0 && <p className="emptyNote">No goals yet. Add your first below.</p>}
          {plan.goals.map((goal) => (
            <GoalItem
              key={goal.id}
              goal={goal}
              locked={locked}
              onUpdate={(data) => actions.updateGoal(goal.id, data)}
              onDelete={() => actions.deleteGoal(goal.id)}
              onCarry={(reason, date) => actions.carryForward(goal.id, reason, date)}
              onAddSubtask={(t) => actions.addSubtask(goal.id, t)}
              onToggleSubtask={(taskId, status) => actions.updateSubtask(taskId, { status })}
              onDeleteSubtask={(taskId) => actions.deleteSubtask(taskId)}
            />
          ))}
        </div>

        {!locked && (
          <form className="addGoalForm" onSubmit={addGoal}>
            <input
              className="goalTitleInput"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a goal…"
            />
            <div className="addGoalControls">
              <select className="goalPriority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY_META[p].dot} {PRIORITY_META[p].label}</option>
                ))}
              </select>
              <label className="minField">
                <input
                  type="number"
                  min={0}
                  step={15}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  aria-label="Estimated minutes"
                />
                <span>min</span>
              </label>
              <button className="primaryButton addBtn" type="submit"><Plus size={16} /> Add</button>
            </div>
          </form>
        )}
      </section>

      {/* Planned vs Actual */}
      {plan.goals.length > 0 && (
        <section className="panel">
          <div className="panelHeadRow"><h2>Planned vs Actual</h2></div>
          <div className="comparisonTable">
            <div className="tableHead"><span>Goal</span><span>Planned</span><span>Actual</span></div>
            {plan.goals.map((g) => (
              <div className="comparisonRow" key={g.id}>
                <strong>{g.title}</strong>
                <p>{g.plannedOutcome ?? "—"}<br /><span>{formatMinutes(g.expectedMinutes)}</span></p>
                <p>{g.actualOutcome ?? statusSentence(g.status)}<br /><span>{formatMinutes(g.actualMinutes)}</span></p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unplanned + Timeline */}
      <section className="twoCol">
        <UnplannedPanel plan={plan} locked={locked} actions={actions} />
        <TimelinePanel plan={plan} locked={locked} actions={actions} />
      </section>

      {/* AI insights */}
      <section className="panel">
        <div className="panelHeadRow">
          <h2><Sparkles size={18} /> AI Insights</h2>
          {!locked && <button className="ghostButton textBtn" onClick={() => actions.regenerateSummary()}>Regenerate</button>}
        </div>
        <div className="insightGrid">
          <Insight icon={<Sparkles />} title="Daily Summary" text={plan.dailySummary?.narrative ?? "Close your day to generate a summary from goals, actuals, blockers, and reflections."} />
          <Insight icon={<AlertTriangle />} title="Reality Check" text={plan.dailySummary?.realityCheck ?? streak?.realityCheck ?? "Plan2Done compares planned scope against your historical completion rate."} />
          <Insight icon={<CalendarDays />} title="Tomorrow" text={plan.dailySummary?.tomorrowSuggestion ?? "Carry unfinished goals forward with a reason, or generate a plan below."} />
        </div>

        {!locked && (
          <div className="aiTools">
            <div className="aiTool">
              <h3><Wand2 size={16} /> Evening brain-dump → structured</h3>
              <textarea value={eveningText} onChange={(e) => setEveningText(e.target.value)} rows={3} placeholder="e.g. Finished the auth fix, only got halfway through API testing because a production issue ate 90 minutes." />
              <div className="aiToolActions">
                <button className="ghostButton" disabled={aiBusy} onClick={() => runEvening(false)}>Preview</button>
                <button className="primaryButton" disabled={aiBusy} onClick={() => runEvening(true)}>Apply to today</button>
              </div>
              {eveningResult && <p className="aiResult">{eveningResult}</p>}
            </div>

            <div className="aiTool">
              <h3><CalendarDays size={16} /> Plan my tomorrow</h3>
              <p className="muted">Suggests a realistic plan from unfinished goals and your typical throughput.</p>
              <button className="primaryButton" disabled={aiBusy} onClick={runTomorrow}>Generate tomorrow&apos;s plan</button>
              {tomorrow && (
                <div className="tomorrowPlan">
                  {tomorrow.items.map((item, i) => (
                    <div key={i} className="tomorrowItem">
                      <span>{PRIORITY_META[item.priority].dot} {item.title}</span>
                      <span>{formatMinutes(item.expectedMinutes)}</span>
                    </div>
                  ))}
                  <p className="aiResult">{tomorrow.note}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {showClosure && (
        <ClosureDialog
          plan={plan}
          onClose={() => setShowClosure(false)}
          onSaveReflection={actions.saveReflection}
          onCloseDay={actions.closeDay}
        />
      )}
    </div>
  );
}

/* ---------- sub-panels ---------- */

function UnplannedPanel({ plan, locked, actions }: { plan: import("./lib/types").DailyPlan; locked: boolean; actions: ReturnType<typeof usePlan>["actions"] }) {
  const [title, setTitle] = useState("");
  const [mins, setMins] = useState(30);
  return (
    <div className="panel">
      <div className="panelHeadRow"><h2><Activity size={18} /> Unplanned Work</h2></div>
      <div className="unplannedList">
        {plan.unplannedWork.length === 0 && <p className="emptyNote">No unplanned work logged.</p>}
        {plan.unplannedWork.map((item) => (
          <div key={item.id} className="unplannedRow">
            <strong>{item.title}</strong>
            <span>{formatMinutes(item.minutes)}</span>
            {!locked && <button className="ghostButton danger" onClick={() => actions.deleteUnplanned(item.id)}>×</button>}
          </div>
        ))}
      </div>
      {!locked && (
        <form
          className="inlineAdd"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            await actions.addUnplanned({ title: title.trim(), minutes: mins });
            setTitle("");
            setMins(30);
          }}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What came up?" />
          <input type="number" min={0} step={15} value={mins} onChange={(e) => setMins(Number(e.target.value))} />
          <button className="ghostButton" type="submit"><Plus size={16} /></button>
        </form>
      )}
      <div className="workTotals">
        <span>Planned {formatMinutes(plan.plannedMinutes)}</span>
        <span>Unplanned {formatMinutes(plan.unplannedMinutes)}</span>
        <span>Actual {formatMinutes(plan.actualMinutes + plan.unplannedMinutes)}</span>
      </div>
    </div>
  );
}

function TimelinePanel({ plan, locked, actions }: { plan: import("./lib/types").DailyPlan; locked: boolean; actions: ReturnType<typeof usePlan>["actions"] }) {
  const [label, setLabel] = useState("");
  return (
    <div className="panel">
      <div className="panelHeadRow"><h2><Clock3 size={18} /> Timeline</h2></div>
      <div className="timeline">
        {plan.timelineEvents.length === 0 && <p className="emptyNote">Log moments as the day unfolds.</p>}
        {plan.timelineEvents.map((ev) => (
          <div key={ev.id} className="timelineRow">
            <span className="timelineTime">{new Date(ev.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="timelineDot" />
            <span className="timelineLabel">{ev.label}</span>
          </div>
        ))}
      </div>
      {!locked && (
        <form
          className="inlineAdd"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!label.trim()) return;
            await actions.addTimeline({ label: label.trim() });
            setLabel("");
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Started API work" />
          <button className="ghostButton" type="submit"><Plus size={16} /></button>
        </form>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metricRow">
      <span>{label}</span>
      <div className="metricBar"><span style={{ width: `${value}%` }} /></div>
      <strong>{value}%</strong>
    </div>
  );
}

function Insight({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="insight">
      <div className="miniIcon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

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

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date(date));
}
