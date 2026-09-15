import { Activity, AlertTriangle, ArrowRight, BarChart3, CalendarDays, CheckCircle2, Clock3, Flame, Plus, Sparkles, Target } from "lucide-react";

type Goal = {
  id: string;
  title: string;
  plannedOutcome?: string;
  actualOutcome?: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "PARTIAL" | "SKIPPED" | "CARRIED_FORWARD";
  expectedMinutes: number;
  actualMinutes: number;
  importance?: string;
  blocker?: string;
};

type DailyPlan = {
  id: string;
  date: string;
  whyTodayMatters?: string;
  plannedMinutes: number;
  actualMinutes: number;
  unplannedMinutes: number;
  overallRating?: number;
  closedAt?: string;
  goals: Goal[];
  unplannedWork: { id: string; title: string; minutes: number; notes?: string }[];
  dailyReflection?: {
    accomplishments?: string;
    incompleteWork?: string;
    incompleteReason?: string;
    unexpectedWork?: string;
    lesson?: string;
    biggestAchievement?: string;
    biggestBlocker?: string;
  };
  dailySummary?: {
    completionRate: number;
    dailyScore: number;
    priorityScore: number;
    estimationScore: number;
    reflectionScore: number;
    narrative: string;
    tomorrowSuggestion?: string;
    realityCheck?: string;
  };
};

const fallbackPlan: DailyPlan = {
  id: "demo",
  date: new Date().toISOString(),
  whyTodayMatters: "Move the most important work forward and understand what actually happens.",
  plannedMinutes: 360,
  actualMinutes: 330,
  unplannedMinutes: 75,
  goals: [
    {
      id: "1",
      title: "Complete Store Builder testing",
      plannedOutcome: "Finish checkout and product flow tests",
      actualOutcome: "Checkout covered; product flow still needs one pass",
      priority: "CRITICAL",
      status: "PARTIAL",
      expectedMinutes: 120,
      actualMinutes: 150,
      importance: "Keeps release confidence high"
    },
    {
      id: "2",
      title: "Fix authentication issue",
      plannedOutcome: "Resolve login and token refresh bug",
      actualOutcome: "Fixed login, token refresh, and session timeout",
      priority: "CRITICAL",
      status: "COMPLETED",
      expectedMinutes: 120,
      actualMinutes: 210,
      importance: "Unblocks testing"
    },
    {
      id: "3",
      title: "Write documentation",
      plannedOutcome: "Draft setup and API notes",
      priority: "MEDIUM",
      status: "PLANNED",
      expectedMinutes: 60,
      actualMinutes: 0,
      importance: "Makes handoff easier"
    },
    {
      id: "4",
      title: "Refactor dashboard components",
      priority: "LOW",
      status: "SKIPPED",
      expectedMinutes: 60,
      actualMinutes: 0
    }
  ],
  unplannedWork: [
    { id: "u1", title: "Production deployment issue", minutes: 45 },
    { id: "u2", title: "Client requested change", minutes: 30 }
  ],
  dailySummary: {
    completionRate: 63,
    dailyScore: 82,
    priorityScore: 88,
    estimationScore: 72,
    reflectionScore: 100,
    narrative: "You planned 4 goals and completed 1. Your most important goal was protected, but authentication debugging expanded and pushed documentation out of the day.",
    tomorrowSuggestion: "Start tomorrow with Store Builder testing, then documentation.",
    realityCheck: "You planned 6 hours, but actual work plus unplanned work reached 6h 45m. Leave a buffer tomorrow."
  }
};

async function getTodayPlan(): Promise<DailyPlan> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  try {
    const response = await fetch(`${baseUrl}/api/daily-plans/today`, { cache: "no-store" });
    if (!response.ok) return fallbackPlan;
    return response.json();
  } catch {
    return fallbackPlan;
  }
}

export default async function Home() {
  const plan = await getTodayPlan();
  const completedValue = plan.goals.reduce((sum, goal) => sum + statusValue(goal.status), 0);
  const progress = plan.goals.length ? Math.round((completedValue / plan.goals.length) * 100) : 0;
  const highPriorityDone = plan.goals.filter((goal) => goal.priority === "CRITICAL" && goal.status === "COMPLETED").length;
  const highPriorityTotal = plan.goals.filter((goal) => goal.priority === "CRITICAL").length;

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Plan2Done</p>
          <h1>Daily Goal + Execution Journal</h1>
        </div>
        <button className="iconButton" aria-label="Add goal">
          <Plus size={20} />
        </button>
      </section>

      <section className="dashboardGrid">
        <article className="dailyPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">{formatLongDate(plan.date)}</p>
              <h2>Today&apos;s Progress</h2>
            </div>
            <strong>{progress}%</strong>
          </div>
          <div className="progressTrack">
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="why">{plan.whyTodayMatters}</p>

          <div className="goalList">
            {plan.goals.map((goal) => (
              <div className="goalRow" key={goal.id}>
                <span className={`statusDot ${goal.status.toLowerCase()}`}>{statusIcon(goal.status)}</span>
                <div>
                  <strong>{goal.title}</strong>
                  <p>{priorityLabel(goal.priority)} · {formatMinutes(goal.expectedMinutes)} planned · {formatMinutes(goal.actualMinutes)} actual</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <aside className="scorePanel">
          <div className="scoreCircle">
            <span>{plan.dailySummary?.dailyScore ?? scoreFromProgress(progress)}</span>
            <small>/100</small>
          </div>
          <h2>Daily Score</h2>
          <div className="scoreRows">
            <Metric label="Goals completed" value={plan.dailySummary?.completionRate ?? progress} />
            <Metric label="Priority goals" value={plan.dailySummary?.priorityScore ?? (highPriorityTotal ? Math.round((highPriorityDone / highPriorityTotal) * 100) : 0)} />
            <Metric label="Time estimation" value={plan.dailySummary?.estimationScore ?? 70} />
            <Metric label="Reflection" value={plan.dailySummary?.reflectionScore ?? 0} />
          </div>
        </aside>
      </section>

      <section className="sectionHeader">
        <div>
          <p className="eyebrow">Core Difference</p>
          <h2>Planned vs Actual</h2>
        </div>
        <ArrowRight size={20} />
      </section>

      <section className="comparisonTable">
        <div className="tableHead">
          <span>Goal</span>
          <span>Planned</span>
          <span>Actual</span>
        </div>
        {plan.goals.map((goal) => (
          <div className="comparisonRow" key={goal.id}>
            <strong>{goal.title}</strong>
            <p>{goal.plannedOutcome ?? "No planned outcome"}<br /><span>{formatMinutes(goal.expectedMinutes)}</span></p>
            <p>{goal.actualOutcome ?? statusSentence(goal.status)}<br /><span>{formatMinutes(goal.actualMinutes)}</span></p>
          </div>
        ))}
      </section>

      <section className="insightGrid">
        <Insight icon={<Sparkles />} title="AI Daily Summary" text={plan.dailySummary?.narrative ?? "Close your day to generate a summary from goals, actuals, blockers, and reflections."} />
        <Insight icon={<AlertTriangle />} title="Reality Check" text={plan.dailySummary?.realityCheck ?? "Plan2Done will compare planned scope against your historical completion rate."} />
        <Insight icon={<CalendarDays />} title="Tomorrow&apos;s Plan" text={plan.dailySummary?.tomorrowSuggestion ?? "Unfinished goals can be carried forward intentionally, with a reason."} />
      </section>

      <section className="workGrid">
        <article>
          <div className="sectionHeader compact">
            <div>
              <p className="eyebrow">During The Day</p>
              <h2>Unplanned Work</h2>
            </div>
            <Activity size={20} />
          </div>
          <div className="unplannedList">
            {plan.unplannedWork.map((item) => (
              <div key={item.id}>
                <strong>{item.title}</strong>
                <span>{formatMinutes(item.minutes)}</span>
              </div>
            ))}
          </div>
        </article>

        <article>
          <div className="sectionHeader compact">
            <div>
              <p className="eyebrow">End Of Day</p>
              <h2>Daily Closure</h2>
            </div>
            <CheckCircle2 size={20} />
          </div>
          <div className="closureStats">
            <Stat icon={<Target />} label="Planned" value={`${plan.goals.length} goals`} />
            <Stat icon={<CheckCircle2 />} label="Completed" value={`${plan.goals.filter((goal) => goal.status === "COMPLETED").length}`} />
            <Stat icon={<Clock3 />} label="Actual work" value={formatMinutes(plan.actualMinutes + plan.unplannedMinutes)} />
            <Stat icon={<Flame />} label="Streak" value="7 days" />
          </div>
        </article>
      </section>

      <section className="weekly">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Weekly Review Preview</h2>
        </div>
        <div className="weeklyStats">
          <Stat icon={<BarChart3 />} label="Completion" value="78%" />
          <Stat icon={<Clock3 />} label="Estimated" value="38h" />
          <Stat icon={<Activity />} label="Actual" value="44h" />
          <Stat icon={<AlertTriangle />} label="Common blocker" value="Unexpected work" />
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
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

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat">
      <div className="miniIcon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function statusValue(status: Goal["status"]) {
  if (status === "COMPLETED") return 1;
  if (status === "PARTIAL") return 0.5;
  if (status === "IN_PROGRESS") return 0.35;
  return 0;
}

function statusIcon(status: Goal["status"]) {
  if (status === "COMPLETED") return "✓";
  if (status === "IN_PROGRESS") return "↻";
  if (status === "PARTIAL") return "◐";
  if (status === "SKIPPED") return "×";
  return "";
}

function statusSentence(status: Goal["status"]) {
  const labels: Record<Goal["status"], string> = {
    PLANNED: "Not started",
    IN_PROGRESS: "Still in progress",
    COMPLETED: "Completed",
    PARTIAL: "Partially completed",
    SKIPPED: "Skipped",
    CARRIED_FORWARD: "Moved forward"
  };
  return labels[status];
}

function priorityLabel(priority: Goal["priority"]) {
  const labels: Record<Goal["priority"], string> = {
    CRITICAL: "Critical",
    HIGH: "High",
    MEDIUM: "Medium",
    LOW: "Low"
  };
  return labels[priority];
}

function scoreFromProgress(progress: number) {
  return Math.round(progress * 0.8 + 20);
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(date));
}
