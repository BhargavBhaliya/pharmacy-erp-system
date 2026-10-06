import { useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformApi } from "../api/platformClient";
import { daysUntil, isUpcomingRenewal } from "../lib/billingAlerts";

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

const REFRESH_INTERVAL_MS = 30_000;

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewAmount, setRenewAmount] = useState("");
  const [renewMode, setRenewMode] = useState("CASH");
  const [error, setError] = useState<string | null>(null);

  // Overdue/upcoming subscriptions are the most time-sensitive thing on the platform admin
  // side, so this list polls in the background rather than only loading once on mount.
  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ["platform", "billing-overview"],
    queryFn: async () => (await platformApi.get<{ data: BillingRow[] }>("/billing-overview")).data.data,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const overdueRows = allRows.filter((r) => r.isOverdue);
  // Not yet overdue, but due soon — a proactive heads-up so renewals happen before a store
  // actually gets locked out, not just after.
  const upcomingRows = allRows.filter(isUpcomingRenewal).sort((a, b) => new Date(a.nextDueDate!).getTime() - new Date(b.nextDueDate!).getTime());

  const renewMutation = useMutation({
    mutationFn: ({ tenantId, amount, mode }: { tenantId: string; amount: number; mode: string }) =>
      platformApi.post(`/stores/${tenantId}/payments`, {
        amount,
        paymentMode: mode,
        extendDueDate: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform", "billing-overview"] });
      setRenewingId(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to record payment");
    },
  });

  function startRenew(row: BillingRow) {
    setError(null);
    setRenewingId(row.id);
    setRenewAmount(row.amount ?? "");
    setRenewMode("CASH");
  }

  function confirmRenew(tenantId: string) {
    setError(null);
    if (!renewAmount || Number(renewAmount) <= 0) {
      setError("Enter a valid amount");
      return;
    }
    renewMutation.mutate({ tenantId, amount: Number(renewAmount), mode: renewMode });
  }

  function renewForm(row: BillingRow) {
    return renewingId === row.id ? (
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
        <button className="btn btn-sm btn-success" disabled={renewMutation.isPending} onClick={() => confirmRenew(row.id)}>
          {renewMutation.isPending ? "..." : "Confirm"}
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => setRenewingId(null)}>
          Cancel
        </button>
      </div>
    ) : null;
  }

  return (
    <div>
      <h3 className="mb-1">Notifications</h3>
      <p className="text-muted mb-4">Stores whose subscription is overdue or renewing soon.</p>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {isLoading && <div className="text-muted">Loading...</div>}

      {!isLoading && overdueRows.length === 0 && upcomingRows.length === 0 && (
        <div className="card card-body text-center text-muted py-5">
          <div className="fs-1 mb-2">✓</div>
          Nothing needs attention right now.
        </div>
      )}

      {overdueRows.length > 0 && (
        <>
          <h6 className="text-danger mb-2">Overdue ({overdueRows.length})</h6>
          <div className="d-flex flex-column gap-2 mb-4">
            {overdueRows.map((r) => (
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
                        <span className="text-danger fw-semibold"> ({-daysUntil(r.nextDueDate)} days overdue)</span>
                      )}
                    </div>
                  </div>

                  {renewForm(r) ?? (
                    <button className="btn btn-sm btn-danger" onClick={() => startRenew(r)}>
                      Renew subscription
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {upcomingRows.length > 0 && (
        <>
          <h6 className="text-warning-emphasis mb-2">Renewing soon ({upcomingRows.length})</h6>
          <div className="d-flex flex-column gap-2">
            {upcomingRows.map((r) => (
              <div key={r.id} className="card border-warning-subtle">
                <div className="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div>
                    <div className="d-flex align-items-center gap-2">
                      <span className="badge text-bg-warning">Due soon</span>
                      <Link to={`/platform/stores/${r.id}`} className="fw-semibold text-decoration-none">
                        {r.businessName}
                      </Link>
                      <span className="text-muted small">({r.storeCode})</span>
                    </div>
                    <div className="small text-muted mt-1">
                      {r.planName ?? "Plan"} · ₹{r.amount ?? "—"} / {r.billingCycle?.toLowerCase() ?? "cycle"} · Due{" "}
                      {r.nextDueDate ? new Date(r.nextDueDate).toLocaleDateString() : "—"}
                      {r.nextDueDate && <span className="text-warning-emphasis fw-semibold"> (in {daysUntil(r.nextDueDate)} days)</span>}
                    </div>
                  </div>

                  {renewForm(r) ?? (
                    <button className="btn btn-sm btn-outline-warning" onClick={() => startRenew(r)}>
                      Renew early
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
