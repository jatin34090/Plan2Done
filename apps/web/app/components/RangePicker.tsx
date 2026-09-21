"use client";

import { useEffect, useState } from "react";
import { RANGE_PRESETS, resolveRange, type RangePreset } from "../lib/types";

/**
 * Date-range selector with presets (last 7/30/90 days, this month/year, all time)
 * and a custom start/end option. Emits the resolved { from, to } YYYY-MM-DD range.
 * `onChange` should be memoised by the parent (useCallback) to avoid refetch loops.
 */
export function RangePicker({
  firstDate,
  onChange,
  initial = "30"
}: {
  firstDate?: string | null;
  onChange: (range: { from: string; to: string }) => void;
  initial?: RangePreset;
}) {
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (preset === "custom") {
      if (customFrom && customTo) onChange({ from: customFrom, to: customTo });
    } else {
      onChange(resolveRange(preset, firstDate));
    }
  }, [preset, customFrom, customTo, firstDate, onChange]);

  return (
    <div className="rangePicker">
      <select
        className="reportRange"
        value={preset}
        onChange={(e) => setPreset(e.target.value as RangePreset)}
        aria-label="Date range"
      >
        {RANGE_PRESETS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      {preset === "custom" && (
        <div className="rangeCustom">
          <input
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
            aria-label="From date"
          />
          <span>→</span>
          <input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
            aria-label="To date"
          />
        </div>
      )}
    </div>
  );
}
