"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../lib/api";
import { formatMinutes, PRIORITY_META } from "../lib/types";
import type { DailyPlan } from "../lib/types";

interface SearchGoal {
  id: string;
  title: string;
  status: string;
  actualOutcome?: string | null;
  dailyPlan: { id: string; date: string };
}

export default function HistoryPage() {
  const [plans, setPlans] = useState<DailyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchGoal[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api.get<DailyPlan[]>("/api/daily-plans").then(setPlans).finally(() => setLoading(false));
  }, []);

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
      </section>

      <form className="searchBar" onSubmit={runSearch}>
        <Search size={18} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Search goals & outcomes — e.g. "authentication"' />
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
        <div className="panelHeadRow"><h2>Recent days</h2></div>
        {loading && <div className="spinner" />}
        <div className="historyList">
          {!loading && plans.length === 0 && <p className="emptyNote">No days recorded yet.</p>}
          {plans.map((p) => {
            const completed = p.goals.filter((g) => g.status === "COMPLETED").length;
            return (
              <Link key={p.id} href={`/day/${p.date.slice(0, 10)}`} className="historyRow">
                <div>
                  <strong>{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(p.date))}</strong>
                  <span className="muted">{p.goals.length} goals · {completed} done · {formatMinutes(p.actualMinutes + p.unplannedMinutes)} worked</span>
                </div>
                <div className="historyGoals">
                  {p.goals.slice(0, 4).map((g) => (
                    <span key={g.id} title={g.title}>{PRIORITY_META[g.priority].dot}</span>
                  ))}
                </div>
                {p.dailySummary && <div className="historyScore">{p.dailySummary.dailyScore}</div>}
                {p.closedAt && <span className="closedTag">Closed</span>}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
