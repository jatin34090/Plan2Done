"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BarChart3, CalendarDays, Clock3, Target, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import { formatMinutes } from "../lib/types";
import { RangePicker } from "../components/RangePicker";

interface Weekly {
  goalsPlanned: number;
  goalsCompleted: number;
  completionRate: number;
  estimatedTime: string;
  actualTime: string;
  mostProductiveDay: string | null;
  carriedOverGoals: number;
  topAchievement: string | null;
  unplannedWorkMinutes: number;
  commonBlocker: string | null;
}

interface Overview {
  days: number;
  averageGoalsPerDay: number;
  averageCompletion: number;
  averageWorkMinutes: number;
  averagePlannedMinutes: number;
  totalGoals: number;
  totalCompleted: number;
  blockers: { reason: string; count: number; percent: number }[];
  productiveDays: { day: string; completion: number }[];
}

interface Estimation {
  sampleSize: number;
  biasPercent: number;
  tendency: string;
  message: string;
}

type ReportGroup = "day" | "month" | "year";

interface ReportBucket {
  key: string;
  goals: number;
  completed: number;
  partial: number;
  carried: number;
  completionRate: number;
  plannedMinutes: number;
  workedMinutes: number;
  avgScore: number | null;
  days: number;
}

interface ReportResponse {
  group: ReportGroup;
  buckets: ReportBucket[];
  totals: {
    goals: number;
    completed: number;
    carried: number;
    plannedMinutes: number;
    workedMinutes: number;
    activeDays: number;
    completionRate: number;
  };
}

function bucketLabel(key: string, group: ReportGroup) {
  if (group === "year") return key;
  const parts = key.split("-").map(Number);
  if (group === "month") {
    return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(parts[0], parts[1] - 1, 1));
  }
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(
    new Date(parts[0], parts[1] - 1, parts[2])
  );
}

const REASON_LABEL: Record<string, string> = {
  NOT_ENOUGH_TIME: "Not enough time",
  LOW_PRIORITY: "Low priority",
  BLOCKED: "Blocked",
  UNEXPECTED_WORK: "Unexpected work",
  TOO_LARGE: "Task too large",
  NO_LONGER_RELEVANT: "No longer relevant"
};

export default function AnalyticsPage() {
  const [weekly, setWeekly] = useState<Weekly | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [estimation, setEstimation] = useState<Estimation | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [group, setGroup] = useState<ReportGroup>("day");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [firstDate, setFirstDate] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(true);

  useEffect(() => {
    api.get<Weekly>("/api/analytics/weekly").then(setWeekly).catch(() => {});
    api.get<Overview>("/api/analytics/overview?days=90").then(setOverview).catch(() => {});
    api.get<Estimation>("/api/analytics/estimation").then(setEstimation).catch(() => {});
    api.get<{ firstDate: string | null }>("/api/analytics/range").then((r) => setFirstDate(r.firstDate)).catch(() => {});
  }, []);

  const onRangeChange = useCallback((r: { from: string; to: string }) => setRange(r), []);

  useEffect(() => {
    if (!range) return;
    setReportLoading(true);
    api
      .get<ReportResponse>(`/api/analytics/report?from=${range.from}&to=${range.to}&group=${group}`)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setReportLoading(false));
  }, [range, group]);

  return (
    <div className="dashboard">
      <section className="dayHeader">
        <div>
          <p className="eyebrow">Productivity analytics</p>
          <h1>Analytics</h1>
        </div>
      </section>

      {/* Weekly review */}
      <section className="panel">
        <div className="panelHeadRow"><h2><BarChart3 size={18} /> Weekly Review</h2><span className="muted">Last 7 days</span></div>
        {weekly && (
          <div className="analyticsGrid">
            <Stat label="Goals planned" value={String(weekly.goalsPlanned)} icon={<Target size={16} />} />
            <Stat label="Goals completed" value={String(weekly.goalsCompleted)} icon={<Target size={16} />} />
            <Stat label="Completion rate" value={`${weekly.completionRate}%`} icon={<TrendingUp size={16} />} />
            <Stat label="Estimated time" value={weekly.estimatedTime} icon={<Clock3 size={16} />} />
            <Stat label="Actual time" value={weekly.actualTime} icon={<Clock3 size={16} />} />
            <Stat label="Carried over" value={String(weekly.carriedOverGoals)} icon={<AlertTriangle size={16} />} />
            <Stat label="Unplanned work" value={formatMinutes(weekly.unplannedWorkMinutes)} icon={<AlertTriangle size={16} />} />
            <Stat label="Common blocker" value={weekly.commonBlocker ? REASON_LABEL[weekly.commonBlocker] : "—"} icon={<AlertTriangle size={16} />} />
          </div>
        )}
        {weekly?.topAchievement && <p className="highlight">🏆 Top achievement: <strong>{weekly.topAchievement}</strong></p>}
      </section>

      {/* Report builder: day / month / year over any range */}
      <section className="panel">
        <div className="panelHeadRow">
          <h2><CalendarDays size={18} /> Report</h2>
          <div className="reportControls">
            <div className="groupToggle" role="tablist" aria-label="Group by">
              {(["day", "month", "year"] as ReportGroup[]).map((g) => (
                <button
                  key={g}
                  className={group === g ? "groupBtn active" : "groupBtn"}
                  onClick={() => setGroup(g)}
                >
                  {g[0].toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
            <RangePicker firstDate={firstDate} onChange={onRangeChange} />
          </div>
        </div>

        {report && (
          <div className="analyticsGrid reportTotals">
            <Stat label="Active days" value={String(report.totals.activeDays)} icon={<CalendarDays size={16} />} />
            <Stat label="Goals" value={String(report.totals.goals)} icon={<Target size={16} />} />
            <Stat label="Completed" value={`${report.totals.completed} (${report.totals.completionRate}%)`} icon={<TrendingUp size={16} />} />
            <Stat label="Worked" value={formatMinutes(report.totals.workedMinutes)} icon={<Clock3 size={16} />} />
          </div>
        )}

        {reportLoading && <div className="spinner" />}
        {!reportLoading && report && report.buckets.length === 0 && (
          <p className="emptyNote">No days with goals in this range yet.</p>
        )}
        {!reportLoading && report && report.buckets.length > 0 && (
          <div className="reportTable">
            <div className="reportHead">
              <span>{group === "day" ? "Day" : group === "month" ? "Month" : "Year"}</span>
              <span>Goals</span>
              <span>Done</span>
              <span>Completion</span>
              <span>Planned</span>
              <span>Worked</span>
              <span>{group === "day" ? "Score" : "Avg score"}</span>
            </div>
            {report.buckets.map((b) => {
              const label = bucketLabel(b.key, group);
              const inner = (
                <>
                  <span className="reportDay">
                    {label}
                    {group !== "day" && <em className="reportClosed">{b.days} day{b.days === 1 ? "" : "s"}</em>}
                  </span>
                  <span>{b.goals}</span>
                  <span>{b.completed}{b.carried > 0 ? ` · ${b.carried}→` : ""}</span>
                  <span>
                    <div className="reportBar"><i style={{ width: `${b.completionRate}%` }} /></div>
                    {b.completionRate}%
                  </span>
                  <span>{formatMinutes(b.plannedMinutes)}</span>
                  <span>{formatMinutes(b.workedMinutes)}</span>
                  <span>{b.avgScore ?? "—"}</span>
                </>
              );
              return group === "day" ? (
                <Link key={b.key} href={`/day/${b.key}`} className="reportRow">{inner}</Link>
              ) : (
                <div key={b.key} className="reportRow static">{inner}</div>
              );
            })}
          </div>
        )}
      </section>

      {/* Estimation accuracy */}
      {estimation && (
        <section className={`panel estimationPanel tendency-${estimation.tendency}`}>
          <div className="panelHeadRow"><h2><Clock3 size={18} /> Estimation Accuracy</h2></div>
          {estimation.sampleSize === 0 ? (
            <p className="emptyNote">{estimation.message}</p>
          ) : (
            <>
              <div className="biasDisplay">
                <strong className={estimation.biasPercent >= 0 ? "over" : "under"}>
                  {estimation.biasPercent > 0 ? "+" : ""}{estimation.biasPercent}%
                </strong>
                <span>{estimation.tendency}</span>
              </div>
              <p className="highlight">{estimation.message}</p>
              <small className="muted">Based on {estimation.sampleSize} goals with logged estimate + actual.</small>
            </>
          )}
        </section>
      )}

      {/* Long-term overview */}
      {overview && (
        <>
          <section className="panel">
            <div className="panelHeadRow"><h2><TrendingUp size={18} /> Long-term ({overview.days} days)</h2></div>
            <div className="analyticsGrid">
              <Stat label="Avg goals / day" value={String(overview.averageGoalsPerDay)} icon={<Target size={16} />} />
              <Stat label="Avg completion" value={`${overview.averageCompletion}%`} icon={<TrendingUp size={16} />} />
              <Stat label="Avg work time" value={formatMinutes(overview.averageWorkMinutes)} icon={<Clock3 size={16} />} />
              <Stat label="Avg planned time" value={formatMinutes(overview.averagePlannedMinutes)} icon={<Clock3 size={16} />} />
            </div>
          </section>

          <section className="twoCol">
            <div className="panel">
              <div className="panelHeadRow"><h2>Most productive days</h2></div>
              <div className="barList">
                {overview.productiveDays.length === 0 && <p className="emptyNote">Not enough data yet.</p>}
                {overview.productiveDays.map((d) => (
                  <div key={d.day} className="barRow">
                    <span className="barLabel">{d.day}</span>
                    <div className="barTrack"><span style={{ width: `${d.completion}%` }} /></div>
                    <strong>{d.completion}%</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panelHeadRow"><h2>Common blockers</h2></div>
              <div className="barList">
                {overview.blockers.length === 0 && <p className="emptyNote">No carry-forward reasons logged yet.</p>}
                {overview.blockers.map((b) => (
                  <div key={b.reason} className="barRow">
                    <span className="barLabel">{REASON_LABEL[b.reason] ?? b.reason}</span>
                    <div className="barTrack"><span className="warn" style={{ width: `${b.percent}%` }} /></div>
                    <strong>{b.percent}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="analyticStat">
      <div className="miniIcon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
