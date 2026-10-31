import { toDateInput, toMonthInput, type DateFilterMode, type DateFilterValue } from "../lib/dateRangeFilter";

interface Props {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
}

const now = new Date();
const currentYear = now.getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear - i);

// "All / Today / Yesterday" quick buttons, plus a specific day/month/year picker — picking a
// date in one of the pickers switches the mode to match it.
export function DateRangeFilter({ value, onChange }: Props) {
  function setMode(mode: DateFilterMode) {
    onChange({ ...value, mode });
  }

  return (
    <div className="d-flex align-items-center gap-2 flex-wrap">
      <div className="btn-group" role="group">
        {(["all", "today", "yesterday"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`btn btn-sm ${value.mode === m ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setMode(m)}
          >
            {m === "all" ? "All" : m === "today" ? "Today" : "Yesterday"}
          </button>
        ))}
      </div>
      <input
        type="date"
        className={`form-control form-control-sm ${value.mode === "day" ? "border-primary" : ""}`}
        style={{ width: 150 }}
        value={value.day || toDateInput(now)}
        onChange={(e) => onChange({ ...value, mode: "day", day: e.target.value })}
      />
      <input
        type="month"
        className={`form-control form-control-sm ${value.mode === "month" ? "border-primary" : ""}`}
        style={{ width: 140 }}
        value={value.month || toMonthInput(now)}
        onChange={(e) => onChange({ ...value, mode: "month", month: e.target.value })}
      />
      <select
        className={`form-select form-select-sm ${value.mode === "year" ? "border-primary" : ""}`}
        style={{ width: 100 }}
        value={value.year || String(currentYear)}
        onChange={(e) => onChange({ ...value, mode: "year", year: e.target.value })}
      >
        {YEAR_OPTIONS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
