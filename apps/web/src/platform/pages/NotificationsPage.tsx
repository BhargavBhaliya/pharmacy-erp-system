import { useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

const REFRESH_INTERVAL_MS = 30_000;

function daysOverdue(dueDate: string): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000);
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [renewAmount, setRenewAmount] = useState("");
  const [renewMode, setRenewMode] = useState("CASH");
  const [error, setError] = useState<string | null>(null);

  // Overdue subscriptions are the most time-sensitive thing on the platform admin side, so this
  // list polls in the background rather than only loading once on mount.
  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ["platform", "billing-overview"],
    queryFn: async () => (await platformApi.get<{ data: BillingRow[] }>("/billing-overview")).data.data,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const rows = allRows.filter((r) => r.isOverdue);

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

  return (
    <div>
      <h3 className="mb-1">Notifications</h3>
      <p className="text-muted mb-4">Stores whose subscription payment is overdue.</p>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {isLoading && <div className="text-muted">Loading...</div>}

      {!isLoading && rows.length === 0 && (
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
                  <button className="btn btn-sm btn-success" disabled={renewMutation.isPending} onClick={() => confirmRenew(r.id)}>
                    {renewMutation.isPending ? "..." : "Confirm"}
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
