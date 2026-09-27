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
  stockValueAtCost?: number;
  stockValueAtMrp?: number;
  unitsSold?: number;
  currentStock?: number;
  classification?: string;
}

const REPORT_TYPES = [
  { key: "sales", label: "Sales Report", endpoint: "/reports/sales", groupOptions: ["day", "product", "category", "user", "customer", "doctor"] },
  { key: "purchases", label: "Purchase Report", endpoint: "/reports/purchases", groupOptions: ["day", "product", "supplier"] },
  { key: "stock-valuation", label: "Stock Valuation", endpoint: "/reports/inventory/stock-valuation", groupOptions: [] },
  { key: "movement", label: "Stock Movement (Fast/Slow/Non-moving)", endpoint: "/reports/inventory/movement", groupOptions: [] },
] as const;

export function ReportsPage() {
  const [reportKey, setReportKey] = useState<(typeof REPORT_TYPES)[number]["key"]>("sales");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [groupBy, setGroupBy] = useState("day");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const report = REPORT_TYPES.find((r) => r.key === reportKey)!;

  useEffect(() => {
    api.get<{ data: Branch[] }>("/branches").then((res) => setBranches(res.data.data));
  }, []);

  async function load() {
    setLoading(true);
    const params: Record<string, string> = {};
    if (branchId) params.branchId = branchId;
    if (report.groupOptions.length > 0) params.groupBy = groupBy;
    const res = await api.get<{ data: Row[] }>(report.endpoint, { params });
    setRows(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey, branchId, groupBy]);

  async function exportCsv() {
    // A plain window.open() wouldn't carry the Authorization header, so fetch it through the
    // authenticated axios client as a blob and trigger the download manually.
    const params: Record<string, string> = { format: "csv" };
    if (branchId) params.branchId = branchId;
    if (report.groupOptions.length > 0) params.groupBy = groupBy;
    const res = await api.get(report.endpoint, { params, responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.key}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const columns = rows.length > 0 ? (Object.keys(rows[0]).filter((c) => c !== "key") as (keyof Row)[]) : [];
  const columnLabel = (c: string) => c.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
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

      <div className="d-flex gap-2 mb-3 flex-wrap">
        <select className="form-select" style={{ width: 260 }} value={reportKey} onChange={(e) => setReportKey(e.target.value as typeof reportKey)}>
          {REPORT_TYPES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        <select className="form-select" style={{ width: 220 }} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">All accessible branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {report.groupOptions.length > 0 && (
          <select className="form-select" style={{ width: 180 }} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {report.groupOptions.map((g) => (
              <option key={g} value={g}>
                By {g}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Label</th>
              {columns
                .filter((c) => c !== "label")
                .map((c) => (
                  <th key={c}>{columnLabel(c)}</th>
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
                    <td key={c}>{String(r[c] ?? "—")}</td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
