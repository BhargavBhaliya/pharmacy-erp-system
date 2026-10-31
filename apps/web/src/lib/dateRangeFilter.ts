// Shared "All / Today / Yesterday / a specific day / month / year" filter used by list pages
// (Sales, Expenses, ...) that let you narrow records down to a date range.
export type DateFilterMode = "all" | "today" | "yesterday" | "day" | "month" | "year";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
export function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function toMonthInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export interface DateFilterValue {
  mode: DateFilterMode;
  day: string;
  month: string;
  year: string;
}

export function computeDateRange({ mode, day, month, year }: DateFilterValue): { from?: Date; to?: Date } {
  const now = new Date();
  if (mode === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (mode === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (mode === "day" && day) {
    const d = new Date(`${day}T00:00:00`);
    return { from: startOfDay(d), to: endOfDay(d) };
  }
  if (mode === "month" && month) {
    const [y, m] = month.split("-").map(Number);
    return { from: new Date(y, m - 1, 1, 0, 0, 0, 0), to: new Date(y, m, 0, 23, 59, 59, 999) };
  }
  if (mode === "year" && year) {
    const y = Number(year);
    return { from: new Date(y, 0, 1, 0, 0, 0, 0), to: new Date(y, 11, 31, 23, 59, 59, 999) };
  }
  return {};
}
