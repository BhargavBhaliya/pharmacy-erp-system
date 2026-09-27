import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Branch {
  id: string;
  name: string;
}
interface Batch {
  id: string;
  batchNumber: string;
  quantity: number;
  product: { id: string; name: string };
}
interface Transfer {
  id: string;
  status: string;
  fromBranch: { name: string };
  toBranch: { name: string };
  items: { id: string; quantity: number; product: { name: string }; batch: { batchNumber: string } }[];
  createdAt: string;
}

const emptyForm = { fromBranchId: "", toBranchId: "", batchId: "", quantity: 1 };

export function StockTransfersPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadTransfers() {
    setLoading(true);
    const res = await api.get<{ data: Transfer[] }>("/stock-transfers");
    setTransfers(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    api.get<{ data: Branch[] }>("/branches").then((res) => setBranches(res.data.data));
    loadTransfers();
  }, []);

  useEffect(() => {
    if (form.fromBranchId) {
      api.get<{ data: Batch[] }>("/batches", { params: { branchId: form.fromBranchId, status: "available" } }).then((res) => setBatches(res.data.data));
    } else {
      setBatches([]);
    }
  }, [form.fromBranchId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const batch = batches.find((b) => b.id === form.batchId);
    if (!batch) {
      setError("Select a batch");
      return;
    }
    try {
      await api.post("/stock-transfers", {
        fromBranchId: form.fromBranchId,
        toBranchId: form.toBranchId,
        items: [{ productId: batch.product.id, batchId: batch.id, quantity: form.quantity }],
      });
      setShowForm(false);
      setForm(emptyForm);
      await loadTransfers();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create transfer");
    }
  }

  async function doAction(id: string, action: "approve" | "reject" | "dispatch" | "receive") {
    setError(null);
    try {
      await api.put(`/stock-transfers/${id}/${action}`);
      await loadTransfers();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : `Failed to ${action}`);
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      REQUESTED: "text-bg-secondary",
      APPROVED: "text-bg-info",
      DISPATCHED: "text-bg-warning",
      RECEIVED: "text-bg-success",
      REJECTED: "text-bg-danger",
      CANCELLED: "text-bg-danger",
    };
    return <span className={`badge ${map[status] ?? "text-bg-secondary"}`}>{status}</span>;
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Stock Transfers</h3>
        {hasPermission("stock_transfer", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "New transfer"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">From branch</label>
              <select className="form-select" required value={form.fromBranchId} onChange={(e) => setForm({ ...form, fromBranchId: e.target.value, batchId: "" })}>
                <option value="">Select</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">To branch</label>
              <select className="form-select" required value={form.toBranchId} onChange={(e) => setForm({ ...form, toBranchId: e.target.value })}>
                <option value="">Select</option>
                {branches.filter((b) => b.id !== form.fromBranchId).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Batch</label>
              <select className="form-select" required value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}>
                <option value="">Select batch</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.product.name} — {b.batchNumber} (avail {b.quantity})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Quantity</label>
              <input type="number" className="form-control" min={1} required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }}>
            Request transfer
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Items</th>
              <th>Status</th>
              <th>Requested</th>
              <th></th>
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
            {transfers.map((t) => (
              <tr key={t.id}>
                <td>{t.fromBranch.name}</td>
                <td>{t.toBranch.name}</td>
                <td>
                  {t.items.map((i) => (
                    <div key={i.id} className="small">
                      {i.product.name} ({i.batch.batchNumber}) × {i.quantity}
                    </div>
                  ))}
                </td>
                <td>{statusBadge(t.status)}</td>
                <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="text-end">
                  <div className="btn-group">
                    {t.status === "REQUESTED" && hasPermission("stock_transfer", "approve") && (
                      <>
                        <button className="btn btn-sm btn-outline-success" onClick={() => doAction(t.id, "approve")}>
                          Approve
                        </button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => doAction(t.id, "reject")}>
                          Reject
                        </button>
                      </>
                    )}
                    {t.status === "APPROVED" && hasPermission("stock_transfer", "add") && (
                      <button className="btn btn-sm btn-outline-primary" onClick={() => doAction(t.id, "dispatch")}>
                        Dispatch
                      </button>
                    )}
                    {t.status === "DISPATCHED" && hasPermission("stock_transfer", "add") && (
                      <button className="btn btn-sm btn-outline-primary" onClick={() => doAction(t.id, "receive")}>
                        Receive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
