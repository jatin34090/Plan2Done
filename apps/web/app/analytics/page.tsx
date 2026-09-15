"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Clock3, Target, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import { formatMinutes } from "../lib/types";

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

  useEffect(() => {
    api.get<Weekly>("/api/analytics/weekly").then(setWeekly).catch(() => {});
    api.get<Overview>("/api/analytics/overview?days=90").then(setOverview).catch(() => {});
    api.get<Estimation>("/api/analytics/estimation").then(setEstimation).catch(() => {});
  }, []);

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
