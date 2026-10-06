import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { platformApi } from "../api/platformClient";

interface BillingRow {
  id: string;
  storeCode: string;
  businessName: string;
  isActive: boolean;
  planName: string | null;
  billingCycle: string | null;
  amount: string | null;
  status: string;
  nextDueDate: string | null;
  isOverdue: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  TRIAL: "text-bg-info",
  ACTIVE: "text-bg-success",
  PAST_DUE: "text-bg-warning",
  EXPIRED: "text-bg-danger",
  CANCELLED: "text-bg-secondary",
  NO_PLAN: "text-bg-light border",
};

type FilterMode = "all" | "overdue" | "no_plan";

export function BillingOverviewPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("all");

  useEffect(() => {
    platformApi.get<{ data: BillingRow[] }>("/billing-overview").then((res) => {
      setRows(res.data.data);
      setLoading(false);
    });
  }, []);

  const filtered = rows.filter((r) => {
    if (filter === "overdue") return r.isOverdue;
    if (filter === "no_plan") return r.status === "NO_PLAN";
    return true;
  });

  const overdueCount = rows.filter((r) => r.isOverdue).length;
  const noPlanCount = rows.filter((r) => r.status === "NO_PLAN").length;

  return (
    <div>
      <h3 className="mb-4">Billing & Subscriptions</h3>

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card card-body">
            <div className="text-muted small">Total stores</div>
            <div className="fs-4 fw-semibold">{rows.length}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card card-body">
            <div className="text-muted small">Overdue</div>
            <div className="fs-4 fw-semibold text-danger">{overdueCount}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card card-body">
            <div className="text-muted small">No plan set</div>
            <div className="fs-4 fw-semibold text-secondary">{noPlanCount}</div>
          </div>
        </div>
      </div>

      <div className="btn-group mb-3">
        {(["all", "overdue", "no_plan"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`btn btn-sm ${filter === m ? "btn-dark" : "btn-outline-dark"}`}
            onClick={() => setFilter(m)}
          >
            {m === "all" ? "All" : m === "overdue" ? "Overdue" : "No plan"}
          </button>
        ))}
      </div>

      <div className="card">
        <table className="table table-hover mb-0">
          <thead>
            <tr>
              <th>Store</th>
              <th>Plan</th>
              <th>Billing cycle</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Next due</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">
                  No stores match this filter.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} role="button" style={{ cursor: "pointer" }} onClick={() => navigate(`/platform/stores/${r.id}`)}>
                <td>
                  <div className="fw-semibold">{r.businessName}</div>
                  <div className="text-muted small">{r.storeCode}</div>
                </td>
                <td>{r.planName ?? "—"}</td>
                <td>{r.billingCycle ?? "—"}</td>
                <td>{r.amount ? `₹${r.amount}` : "—"}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[r.status] ?? "text-bg-light border"}`}>{r.status.replace("_", " ")}</span>
                </td>
                <td className={r.isOverdue ? "text-danger fw-semibold" : ""}>
                  {r.nextDueDate ? new Date(r.nextDueDate).toLocaleDateString() : "—"}
                  {r.isOverdue && " (overdue)"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
