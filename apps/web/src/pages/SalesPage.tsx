import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Sale {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  totalAmount: string;
  paymentStatus: string;
  status: string;
  customer?: { name: string } | null;
  branch: { name: string };
  createdAt: string;
}

export function SalesPage() {
  const { hasPermission } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await api.get<{ data: Sale[] }>("/sales");
    setSales(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCancel(id: string) {
    setError(null);
    try {
      await api.put(`/sales/${id}/cancel`, { cancelReason: reason });
      setCancellingId(null);
      setReason("");
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to cancel sale");
    }
  }

  const statusBadge = (status: string) => (
    <span className={`badge ${status === "CANCELLED" ? "text-bg-danger" : "text-bg-success"}`}>{status}</span>
  );
  const paymentBadge = (status: string) => {
    const map: Record<string, string> = { UNPAID: "text-bg-danger", PARTIAL: "text-bg-warning", PAID: "text-bg-success" };
    return <span className={`badge ${map[status] ?? "text-bg-secondary"}`}>{status}</span>;
  };

  return (
    <div>
      <h3 className="mb-4">Sales</h3>
      {error && <div className="alert alert-danger py-2">{error}</div>}
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
            {loading && (
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
                <td>{s.customer?.name ?? "Walk-in"}</td>
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
