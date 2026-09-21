"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { api } from "../lib/api";
import { formatMinutes, PRIORITY_META } from "../lib/types";
import type { DailyPlan, Status } from "../lib/types";
import { RangePicker } from "../components/RangePicker";

interface SearchGoal {
  id: string;
  title: string;
  status: string;
  actualOutcome?: string | null;
  dailyPlan: { id: string; date: string };
}

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

export default function HistoryPage() {
  const [plans, setPlans] = useState<DailyPlan[] | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [firstDate, setFirstDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchGoal[] | null>(null);
  const [searching, setSearching] = useState(false);

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

  const active = (plans ?? []).filter(
    (p) => p.goals.length > 0 || p.unplannedWork.length > 0 || p.timelineEvents.length > 0
  );

  function toggle(id: string) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get<{ goals: SearchGoal[] }>(`/api/daily-plans/search/${encodeURIComponent(query.trim())}`);
      setResults(res.goals);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="dashboard">
      <section className="dayHeader">
        <div>
          <p className="eyebrow">Your record</p>
          <h1>History</h1>
        </div>
        <RangePicker firstDate={firstDate} onChange={onRangeChange} initial="30" />
      </section>

      <form className="searchBar" onSubmit={runSearch}>
        <Search size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search goals & outcomes across all time…" />
        <button className="primaryButton" type="submit" disabled={searching}>{searching ? "…" : "Search"}</button>
      </form>

      {results && (
        <section className="panel">
          <div className="panelHeadRow"><h2>{results.length} result{results.length === 1 ? "" : "s"}</h2>
            <button className="ghostButton textBtn" onClick={() => { setResults(null); setQuery(""); }}>Clear</button>
          </div>
          <div className="goalList">
            {results.length === 0 && <p className="emptyNote">Nothing found.</p>}
            {results.map((g) => (
              <Link key={g.id} href={`/day/${g.dailyPlan.date.slice(0, 10)}`} className="searchResult">
                <strong>{g.title}</strong>
                {g.actualOutcome && <span>{g.actualOutcome}</span>}
                <small>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(g.dailyPlan.date))} · {g.status}</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panelHeadRow"><h2>Days</h2></div>
        {loading && <div className="centerLoading"><div className="spinner" /></div>}
        {!loading && active.length === 0 && <p className="emptyNote">No days with activity in this range yet.</p>}
        <div className="historyList">
          {!loading && active.map((p) => {
            const completed = p.goals.filter((g) => g.status === "COMPLETED").length;
            const subtasks = p.goals.reduce((s, g) => s + g.tasks.length, 0);
            const subtasksDone = p.goals.reduce((s, g) => s + g.tasks.filter((t) => t.status === "COMPLETED").length, 0);
            const isOpen = expanded[p.id];
            return (
              <div key={p.id} className="historyDay">
                <button className="historyRow" onClick={() => toggle(p.id)} aria-expanded={isOpen}>
                  <span className="expandChevron">{isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
                  <div className="historyRowMain">
                    <strong>{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(p.date))}</strong>
                    <span className="muted">
                      {p.goals.length} goals · {completed} done
                      {subtasks > 0 && ` · ${subtasksDone}/${subtasks} subtasks`}
                      {" · "}{formatMinutes(p.actualMinutes + p.unplannedMinutes)} worked
                    </span>
                  </div>
                  <div className="historyGoals">
                    {p.goals.slice(0, 4).map((g) => (
                      <span key={g.id} title={g.title}>{PRIORITY_META[g.priority].dot}</span>
                    ))}
                  </div>
                  {p.dailySummary && <div className="historyScore">{p.dailySummary.dailyScore}</div>}
                  {p.closedAt && <span className="closedTag">Closed</span>}
                </button>

                {isOpen && (
                  <div className="historyDayBody">
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
                    <Link href={`/day/${p.date.slice(0, 10)}`} className="ghostButton textBtn openDayLink">Open full day →</Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
