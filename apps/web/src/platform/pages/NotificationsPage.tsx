import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { platformApi } from "../api/platformClient";

interface BillingRow {
  id: string;
  storeCode: string;
  businessName: string;
  planName: string | null;
  billingCycle: string | null;
  amount: string | null;
  status: string;
  nextDueDate: string | null;
  isOverdue: boolean;
}

function daysOverdue(dueDate: string): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000);
}

export function NotificationsPage() {
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewAmount, setRenewAmount] = useState("");
  const [renewMode, setRenewMode] = useState("CASH");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await platformApi.get<{ data: BillingRow[] }>("/billing-overview");
    setRows(res.data.data.filter((r) => r.isOverdue));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startRenew(row: BillingRow) {
    setError(null);
    setRenewingId(row.id);
    setRenewAmount(row.amount ?? "");
    setRenewMode("CASH");
  }

  async function confirmRenew(tenantId: string) {
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
      <h3 className="mb-1">Notifications</h3>
      <p className="text-muted mb-4">Stores whose subscription payment is overdue.</p>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {loading && <div className="text-muted">Loading...</div>}

      {!loading && rows.length === 0 && (
        <div className="card card-body text-center text-muted py-5">
          <div className="fs-1 mb-2">✓</div>
          No overdue subscriptions right now.
        </div>
      )}

      <div className="d-flex flex-column gap-2">
        {rows.map((r) => (
          <div key={r.id} className="card border-danger-subtle">
            <div className="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge text-bg-danger">Expired plan</span>
                  <Link to={`/platform/stores/${r.id}`} className="fw-semibold text-decoration-none">
                    {r.businessName}
                  </Link>
                  <span className="text-muted small">({r.storeCode})</span>
                </div>
                <div className="small text-muted mt-1">
                  {r.planName ?? "Plan"} · ₹{r.amount ?? "—"} / {r.billingCycle?.toLowerCase() ?? "cycle"} · Due{" "}
                  {r.nextDueDate ? new Date(r.nextDueDate).toLocaleDateString() : "—"}
                  {r.nextDueDate && (
                    <span className="text-danger fw-semibold"> ({daysOverdue(r.nextDueDate)} days overdue)</span>
                  )}
                </div>
              </div>

              {renewingId === r.id ? (
                <div className="d-flex gap-1 align-items-center">
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
                  <button className="btn btn-sm btn-success" disabled={submitting} onClick={() => confirmRenew(r.id)}>
                    {submitting ? "..." : "Confirm"}
                  </button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setRenewingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="btn btn-sm btn-danger" onClick={() => startRenew(r)}>
                  Renew subscription
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
