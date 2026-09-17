"use client";

import { useState } from "react";
import { Moon, Sparkles, X } from "lucide-react";
import type { DailyPlan } from "../lib/types";

interface Props {
  plan: DailyPlan;
  onClose: () => void;
  onSaveReflection: (data: Record<string, string>) => Promise<unknown>;
  onCloseDay: (rating?: number) => Promise<unknown>;
}

export function ClosureDialog({ plan, onClose, onSaveReflection, onCloseDay }: Props) {
  const r = plan.dailyReflection;
  const [form, setForm] = useState({
    accomplishments: r?.accomplishments ?? "",
    incompleteWork: r?.incompleteWork ?? "",
    incompleteReason: r?.incompleteReason ?? "",
    unexpectedWork: r?.unexpectedWork ?? "",
    lesson: r?.lesson ?? "",
    biggestAchievement: r?.biggestAchievement ?? "",
    biggestBlocker: r?.biggestBlocker ?? "",
    moveToTomorrow: r?.moveToTomorrow ?? ""
  });
  const [rating, setRating] = useState(plan.overallRating ?? 0);
  const [busy, setBusy] = useState(false);

  const counts = {
    planned: plan.goals.length,
    completed: plan.goals.filter((g) => g.status === "COMPLETED").length,
    partial: plan.goals.filter((g) => g.status === "PARTIAL" || g.status === "IN_PROGRESS").length,
    skipped: plan.goals.filter((g) => g.status === "SKIPPED").length
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function generate() {
    setBusy(true);
    try {
      await onSaveReflection(form);
      await onCloseDay(rating);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <h2><Moon size={20} /> Close your day</h2>
          <button className="ghostButton" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="closureCounts">
          <div><strong>{counts.planned}</strong><span>Planned</span></div>
          <div><strong>{counts.completed}</strong><span>Completed</span></div>
          <div><strong>{counts.partial}</strong><span>Partial</span></div>
          <div><strong>{counts.skipped}</strong><span>Skipped</span></div>
        </div>

        <div className="closureForm">
          <label className="fullField">
            What did you actually accomplish?
            <textarea value={form.accomplishments} onChange={set("accomplishments")} rows={2} />
          </label>
          <div className="detailGrid">
            <label>What didn&apos;t you finish?<textarea value={form.incompleteWork} onChange={set("incompleteWork")} rows={2} /></label>
            <label>Why?<textarea value={form.incompleteReason} onChange={set("incompleteReason")} rows={2} /></label>
          </div>
          <label className="fullField">Any unexpected work?<textarea value={form.unexpectedWork} onChange={set("unexpectedWork")} rows={2} /></label>
          <div className="detailGrid">
            <label>Biggest achievement<input value={form.biggestAchievement} onChange={set("biggestAchievement")} /></label>
            <label>Biggest blocker<input value={form.biggestBlocker} onChange={set("biggestBlocker")} /></label>
          </div>
          <label className="fullField">What did you learn?<textarea value={form.lesson} onChange={set("lesson")} rows={2} /></label>
          <label className="fullField">What should move to tomorrow?<input value={form.moveToTomorrow} onChange={set("moveToTomorrow")} /></label>

          <label className="fullField">
            Overall day rating: <strong>{rating}/10</strong>
            <input
              type="range"
              min={0}
              max={10}
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
            />
          </label>
        </div>

        <button className="primaryButton wide" onClick={generate} disabled={busy}>
          <Sparkles size={16} /> {busy ? "Generating…" : "Generate daily report & close"}
        </button>
      </div>
    </div>
  );
}
