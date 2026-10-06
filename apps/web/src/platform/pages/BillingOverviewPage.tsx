import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
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
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewAmount, setRenewAmount] = useState("");
  const [renewMode, setRenewMode] = useState("CASH");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await platformApi.get<{ data: BillingRow[] }>("/billing-overview");
    setRows(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => {
    if (filter === "overdue") return r.isOverdue;
    if (filter === "no_plan") return r.status === "NO_PLAN";
    return true;
  });

  const overdueCount = rows.filter((r) => r.isOverdue).length;
  const noPlanCount = rows.filter((r) => r.status === "NO_PLAN").length;

  function startRenew(e: React.MouseEvent, row: BillingRow) {
    e.stopPropagation();
    setError(null);
    setRenewingId(row.id);
    setRenewAmount(row.amount ?? "");
    setRenewMode("CASH");
  }

  async function confirmRenew(e: React.MouseEvent, tenantId: string) {
    e.stopPropagation();
    setError(null);
    if (!renewAmount || Number(renewAmount) <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      await platformApi.post(`/stores/${tenantId}/payments`, {
        amount: Number(renewAmount),
        paymentMode: renewMode,
        extendDueDate: true,
      });
      setRenewingId(null);
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

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

      {error && <div className="alert alert-danger py-2">{error}</div>}

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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
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
                <td className="text-end">
                  {r.status !== "NO_PLAN" &&
                    (renewingId === r.id ? (
                      <div className="d-flex gap-1 justify-content-end align-items-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          style={{ width: 90 }}
                          value={renewAmount}
                          onChange={(e) => setRenewAmount(e.target.value)}
                        />
                        <select className="form-select form-select-sm" style={{ width: 90 }} value={renewMode} onChange={(e) => setRenewMode(e.target.value)}>
                          {["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"].map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn-sm btn-success" disabled={submitting} onClick={(e) => confirmRenew(e, r.id)}>
                          {submitting ? "..." : "Confirm"}
                        </button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={(e) => { e.stopPropagation(); setRenewingId(null); }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className={`btn btn-sm ${r.isOverdue ? "btn-danger" : "btn-outline-success"}`} onClick={(e) => startRenew(e, r)}>
                        Renew
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
