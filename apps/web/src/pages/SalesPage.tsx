import { useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Sale {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  totalAmount: string;
  paymentStatus: string;
  status: string;
  customer?: { name: string; mobile?: string | null } | null;
  branch: { name: string };
  createdAt: string;
}

type FilterMode = "all" | "today" | "yesterday" | "day" | "month";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toMonthInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function SalesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [dayValue, setDayValue] = useState(toDateInput(new Date()));
  const [monthValue, setMonthValue] = useState(toMonthInput(new Date()));

  function computeRange(): { from?: Date; to?: Date } {
    const now = new Date();
    if (filterMode === "today") return { from: startOfDay(now), to: endOfDay(now) };
    if (filterMode === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    if (filterMode === "day" && dayValue) {
      const d = new Date(`${dayValue}T00:00:00`);
      return { from: startOfDay(d), to: endOfDay(d) };
    }
    if (filterMode === "month" && monthValue) {
      const [y, m] = monthValue.split("-").map(Number);
      return { from: new Date(y, m - 1, 1, 0, 0, 0, 0), to: new Date(y, m, 0, 23, 59, 59, 999) };
    }
    return {};
  }

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", filterMode, dayValue, monthValue],
    queryFn: async () => {
      const { from, to } = computeRange();
      const res = await api.get<{ data: Sale[] }>("/sales", {
        params: { ...(from ? { from: from.toISOString() } : {}), ...(to ? { to: to.toISOString() } : {}) },
      });
      return res.data.data;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, cancelReason }: { id: string; cancelReason: string }) =>
      api.put(`/sales/${id}/cancel`, { cancelReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      setCancellingId(null);
      setReason("");
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to cancel sale");
    },
  });

  function handleCancel(id: string) {
    cancelMutation.mutate({ id, cancelReason: reason });
  }

  const statusBadge = (status: string) => (
    <span className={`badge ${status === "CANCELLED" ? "text-bg-danger" : "text-bg-success"}`}>{status}</span>
  );
  const paymentBadge = (status: string) => {
    const map: Record<string, string> = { UNPAID: "text-bg-danger", PARTIAL: "text-bg-warning", PAID: "text-bg-success" };
    return <span className={`badge ${map[status] ?? "text-bg-secondary"}`}>{status}</span>;
  };

  const totalAmount = sales.filter((s) => s.status !== "CANCELLED").reduce((sum, s) => sum + Number(s.totalAmount), 0);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h3 className="mb-0">Sales</h3>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <div className="btn-group" role="group">
            {(["all", "today", "yesterday"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`btn btn-sm ${filterMode === m ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setFilterMode(m)}
              >
                {m === "all" ? "All" : m === "today" ? "Today" : "Yesterday"}
              </button>
            ))}
          </div>
          <input
            type="date"
            className={`form-control form-control-sm ${filterMode === "day" ? "border-primary" : ""}`}
            style={{ width: 150 }}
            value={dayValue}
            onChange={(e) => {
              setDayValue(e.target.value);
              setFilterMode("day");
            }}
          />
          <input
            type="month"
            className={`form-control form-control-sm ${filterMode === "month" ? "border-primary" : ""}`}
            style={{ width: 140 }}
            value={monthValue}
            onChange={(e) => {
              setMonthValue(e.target.value);
              setFilterMode("month");
            }}
          />
        </div>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      <div className="d-flex justify-content-between align-items-center mb-2 text-muted small">
        <span>{isLoading ? "Loading..." : `${sales.length} invoice(s)`}</span>
        <span className="fw-semibold fs-6 text-dark">Total: ₹{totalAmount.toFixed(2)}</span>
      </div>

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Type</th>
              <th>Customer</th>
              <th>Branch</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {sales.map((s) => (
              <tr key={s.id}>
                <td>{s.invoiceNumber}</td>
                <td>{s.invoiceType}</td>
                <td>
                  {s.customer?.name ?? "Walk-in"}
                  {s.customer?.mobile && <div className="text-muted small">{s.customer.mobile}</div>}
                </td>
                <td>{s.branch.name}</td>
                <td>₹{s.totalAmount}</td>
                <td>{paymentBadge(s.paymentStatus)}</td>
                <td>{statusBadge(s.status)}</td>
                <td className="text-end">
                  {hasPermission("sales", "print") && (
                    <Link to={`/sales/${s.id}/print`} className="btn btn-sm btn-outline-secondary me-1">
                      Print
                    </Link>
                  )}
                  {s.status === "CONFIRMED" && hasPermission("sales", "cancel") && (
                    cancellingId === s.id ? (
                      <div className="d-flex gap-1 justify-content-end">
                        <input className="form-control form-control-sm" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                        <button className="btn btn-sm btn-danger" onClick={() => handleCancel(s.id)} disabled={!reason}>
                          Confirm
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-sm btn-outline-danger" onClick={() => setCancellingId(s.id)}>
                        Cancel
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
