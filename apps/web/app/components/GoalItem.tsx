"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CornerUpRight, Plus, Trash2 } from "lucide-react";
import { CARRY_REASONS, formatMinutes, PRIORITY_META } from "../lib/types";
import type { CarryReason, Goal, Priority, Status } from "../lib/types";

const STATUS_OPTIONS: { value: Status; label: string; icon: string }[] = [
  { value: "PLANNED", label: "Planned", icon: "⬜" },
  { value: "IN_PROGRESS", label: "In progress", icon: "🔄" },
  { value: "COMPLETED", label: "Completed", icon: "✅" },
  { value: "PARTIAL", label: "Partial", icon: "◐" },
  { value: "SKIPPED", label: "Skipped", icon: "⏭️" }
];

interface Props {
  goal: Goal;
  locked: boolean;
  onUpdate: (data: Partial<{ title: string; status: Status; priority: Priority; expectedMinutes: number; actualMinutes: number; plannedOutcome: string; actualOutcome: string; blocker: string }>) => void;
  onDelete: () => void;
  onCarry: (reason: CarryReason, targetDate: string) => void;
  onAddSubtask: (title: string) => void;
  onToggleSubtask: (taskId: string, status: Status) => void;
  onDeleteSubtask: (taskId: string) => void;
}

export function GoalItem({ goal, locked, onUpdate, onDelete, onCarry, onAddSubtask, onToggleSubtask, onDeleteSubtask }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [carryOpen, setCarryOpen] = useState(false);
  const meta = PRIORITY_META[goal.priority];
  const done = goal.tasks.filter((t) => t.status === "COMPLETED").length;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  return (
    <div className={`goalCard status-${goal.status.toLowerCase()}`}>
      <div className="goalMain">
        <button className="expandBtn" onClick={() => setExpanded((v) => !v)} aria-label="Toggle details">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        <div className="goalBody">
          <div className="goalTopRow">
            <span className="goalTitle" style={{ textDecoration: goal.status === "COMPLETED" ? "line-through" : "none" }}>
              {goal.title}
            </span>
            {!locked && (
              <div className="goalActions">
                {goal.status !== "COMPLETED" && (
                  <button className="ghostButton" title="Carry forward" onClick={() => setCarryOpen((v) => !v)}>
                    <CornerUpRight size={16} />
                  </button>
                )}
                <button className="ghostButton danger" title="Delete" onClick={onDelete}>
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="goalControls">
            <select
              className="statusSelect"
              value={goal.status}
              disabled={locked}
              onChange={(e) => onUpdate({ status: e.target.value as Status })}
              aria-label="Status"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.icon} {s.label}
                </option>
              ))}
              {goal.status === "CARRIED_FORWARD" && <option value="CARRIED_FORWARD">➡️ Carried forward</option>}
            </select>
            <div className="goalMeta">
              <span className="priorityTag" style={{ color: meta.color }}>{meta.dot} {meta.label}</span>
              <span>{formatMinutes(goal.expectedMinutes)} planned</span>
              {goal.actualMinutes > 0 && <span>· {formatMinutes(goal.actualMinutes)} actual</span>}
              {goal.tasks.length > 0 && <span>· {done}/{goal.tasks.length} done</span>}
            </div>
          </div>
        </div>
      </div>

      {carryOpen && !locked && (
        <div className="carryBox">
          <span>Why wasn&apos;t this completed?</span>
          <div className="carryReasons">
            {CARRY_REASONS.map((r) => (
              <button
                key={r.value}
                className="chip"
                onClick={() => {
                  onCarry(r.value, tomorrowStr);
                  setCarryOpen(false);
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <small>Copies this goal to tomorrow ({tomorrowStr}).</small>
        </div>
      )}

      {expanded && (
        <div className="goalDetails">
          <div className="detailGrid">
            <label>
              Priority
              <select value={goal.priority} disabled={locked} onChange={(e) => onUpdate({ priority: e.target.value as Priority })}>
                {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY_META[p].label}</option>
                ))}
              </select>
            </label>
            <label>
              Estimated (min)
              <input
                type="number"
                min={0}
                defaultValue={goal.expectedMinutes}
                disabled={locked}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== goal.expectedMinutes) onUpdate({ expectedMinutes: v });
                }}
              />
            </label>
            <label>
              Actual (min)
              <input
                type="number"
                min={0}
                defaultValue={goal.actualMinutes}
                disabled={locked}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== goal.actualMinutes) onUpdate({ actualMinutes: v });
                }}
              />
            </label>
          </div>

          <label className="fullField">
            Planned outcome
            <input
              defaultValue={goal.plannedOutcome ?? ""}
              disabled={locked}
              placeholder="What does done look like?"
              onBlur={(e) => {
                if (e.target.value !== (goal.plannedOutcome ?? "")) onUpdate({ plannedOutcome: e.target.value });
              }}
            />
          </label>
          <label className="fullField">
            Actual outcome
            <input
              defaultValue={goal.actualOutcome ?? ""}
              disabled={locked}
              placeholder="What actually happened?"
              onBlur={(e) => {
                if (e.target.value !== (goal.actualOutcome ?? "")) onUpdate({ actualOutcome: e.target.value });
              }}
            />
          </label>
          <label className="fullField">
            Blocker
            <input
              defaultValue={goal.blocker ?? ""}
              disabled={locked}
              placeholder="Anything blocking this?"
              onBlur={(e) => {
                if (e.target.value !== (goal.blocker ?? "")) onUpdate({ blocker: e.target.value });
              }}
            />
          </label>

          <div className="subtasks">
            <span className="subtasksLabel">Subtasks</span>
            {goal.tasks.map((task) => (
              <div key={task.id} className="subtaskRow">
                <input
                  type="checkbox"
                  checked={task.status === "COMPLETED"}
                  disabled={locked}
                  onChange={(e) => onToggleSubtask(task.id, e.target.checked ? "COMPLETED" : "PLANNED")}
                />
                <span style={{ textDecoration: task.status === "COMPLETED" ? "line-through" : "none" }}>{task.title}</span>
                {!locked && (
                  <button className="ghostButton danger" onClick={() => onDeleteSubtask(task.id)} aria-label="Delete subtask">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            {!locked && (
              <form
                className="subtaskAdd"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (subtaskTitle.trim()) {
                    onAddSubtask(subtaskTitle.trim());
                    setSubtaskTitle("");
                  }
                }}
              >
                <input
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                  placeholder="Break this into a step…"
                />
                <button className="ghostButton" type="submit" aria-label="Add subtask">
                  <Plus size={16} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
