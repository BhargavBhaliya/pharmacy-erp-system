import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Branch {
  id: string;
  name: string;
}
interface Row {
  key: string;
  label: string;
  totalAmount?: number;
  quantity?: number;
  invoiceCount?: number;
  expenseCount?: number;
  stockValueAtCost?: number;
  stockValueAtMrp?: number;
  unitsSold?: number;
  currentStock?: number;
  classification?: string;
}

const REPORT_TYPES = [
  {
    key: "sales",
    label: "Sales Report",
    endpoint: "/reports/sales",
    groupOptions: ["day", "month", "year", "product", "category", "user", "customer", "doctor"],
    hasDateFilter: true,
  },
  {
    key: "expenses",
    label: "Expense Report",
    endpoint: "/reports/expenses",
    groupOptions: ["day", "month", "year", "category", "branch", "paymentMode"],
    hasDateFilter: true,
  },
  {
    key: "purchases",
    label: "Purchase Report",
    endpoint: "/reports/purchases",
    groupOptions: ["day", "month", "year", "product", "supplier"],
    hasDateFilter: true,
  },
  { key: "stock-valuation", label: "Stock Valuation", endpoint: "/reports/inventory/stock-valuation", groupOptions: [], hasDateFilter: false },
  { key: "movement", label: "Stock Movement (Fast/Slow/Non-moving)", endpoint: "/reports/inventory/movement", groupOptions: [], hasDateFilter: false },
] as const;

type FilterMode = "range" | "today" | "yesterday" | "month" | "year";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toMonthInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function ReportsPage() {
  const [reportKey, setReportKey] = useState<(typeof REPORT_TYPES)[number]["key"]>("sales");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [groupBy, setGroupBy] = useState("day");
  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const [fromDate, setFromDate] = useState(toDateInput(new Date(Date.now() - 30 * 86_400_000)));
  const [toDate, setToDate] = useState(toDateInput(new Date()));
  const [monthValue, setMonthValue] = useState(toMonthInput(new Date()));
  const [yearValue, setYearValue] = useState(String(new Date().getFullYear()));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const report = REPORT_TYPES.find((r) => r.key === reportKey)!;

  useEffect(() => {
    api.get<{ data: Branch[] }>("/branches").then((res) => setBranches(res.data.data));
  }, []);

  // Switching report type resets groupBy to that report's first option so stale values
  // (e.g. "doctor" while looking at the Expense report) can't leak across.
  useEffect(() => {
    setGroupBy(report.groupOptions[0] ?? "day");
  }, [reportKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function computeDateParams(): { from?: string; to?: string } {
    if (!report.hasDateFilter) return {};
    const now = new Date();
    if (filterMode === "today") {
      const d = toDateInput(now);
      return { from: d, to: d };
    }
    if (filterMode === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const d = toDateInput(y);
      return { from: d, to: d };
    }
    if (filterMode === "month") {
      const [y, m] = monthValue.split("-").map(Number);
      return { from: toDateInput(new Date(y, m - 1, 1)), to: toDateInput(new Date(y, m, 0)) };
    }
    if (filterMode === "year") {
      const y = Number(yearValue);
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    return { from: fromDate, to: toDate };
  }

  function buildParams(extra: Record<string, string> = {}) {
    const params: Record<string, string> = { ...extra };
    if (branchId) params.branchId = branchId;
    if (report.groupOptions.length > 0) params.groupBy = groupBy;
    const { from, to } = computeDateParams();
    if (from) params.from = from;
    if (to) params.to = to;
    return params;
  }

  async function load() {
    setLoading(true);
    const res = await api.get<{ data: Row[] }>(report.endpoint, { params: buildParams() });
    setRows(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey, branchId, groupBy, filterMode, fromDate, toDate, monthValue, yearValue]);

  async function exportCsv() {
    // A plain window.open() wouldn't carry the Authorization header, so fetch it through the
    // authenticated axios client as a blob and trigger the download manually.
    const res = await api.get(report.endpoint, { params: buildParams({ format: "csv" }), responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.key}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const columns = rows.length > 0 ? (Object.keys(rows[0]).filter((c) => c !== "key") as (keyof Row)[]) : [];
  const columnLabel = (c: string) => c.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
  const numericColumns = new Set(["totalAmount", "quantity", "invoiceCount", "expenseCount", "stockValueAtCost", "stockValueAtMrp", "unitsSold", "currentStock"]);
  const totalAmountSum = rows.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2 no-print">
        <h3 className="mb-0">Reports</h3>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn btn-outline-secondary" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      <div className="d-flex gap-2 mb-3 flex-wrap no-print">
        <select className="form-select" style={{ width: 220 }} value={reportKey} onChange={(e) => setReportKey(e.target.value as typeof reportKey)}>
          {REPORT_TYPES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <select className="form-select" style={{ width: 200 }} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">All accessible branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {report.groupOptions.length > 0 && (
          <select className="form-select" style={{ width: 160 }} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {report.groupOptions.map((g) => (
              <option key={g} value={g}>
                By {g}
              </option>
            ))}
          </select>
        )}
      </div>

      {report.hasDateFilter && (
        <div className="d-flex gap-2 mb-3 flex-wrap align-items-center no-print">
          <div className="btn-group">
            {(["today", "yesterday", "month", "year", "range"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`btn btn-sm ${filterMode === m ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setFilterMode(m)}
              >
                {m === "today" ? "Today" : m === "yesterday" ? "Yesterday" : m === "month" ? "Month" : m === "year" ? "Year" : "Custom range"}
              </button>
            ))}
          </div>
          {filterMode === "month" && (
            <input type="month" className="form-control form-control-sm" style={{ width: 140 }} value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
          )}
          {filterMode === "year" && (
            <input
              type="number"
              className="form-control form-control-sm"
              style={{ width: 100 }}
              value={yearValue}
              onChange={(e) => setYearValue(e.target.value)}
              min={2000}
              max={2100}
            />
          )}
          {filterMode === "range" && (
            <>
              <input type="date" className="form-control form-control-sm" style={{ width: 150 }} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <span className="text-muted small">to</span>
              <input type="date" className="form-control form-control-sm" style={{ width: 150 }} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </>
          )}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-2 text-muted small">
        <span>{loading ? "Loading..." : `${rows.length} row(s)`}</span>
        {rows.some((r) => r.totalAmount !== undefined) && <span className="fw-semibold fs-6 text-dark">Total: ₹{totalAmountSum.toFixed(2)}</span>}
      </div>

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Label</th>
              {columns
                .filter((c) => c !== "label")
                .map((c) => (
                  <th key={c} className={numericColumns.has(c) ? "text-end" : ""}>
                    {columnLabel(c)}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={columns.length + 1} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="text-center text-muted py-4">
                  No data for this selection.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                {columns
                  .filter((c) => c !== "label")
                  .map((c) => (
                    <td key={c} className={numericColumns.has(c) ? "text-end" : ""}>
                      {String(r[c] ?? "—")}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
