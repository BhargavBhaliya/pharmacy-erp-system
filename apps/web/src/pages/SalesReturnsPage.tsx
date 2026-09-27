import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Sale {
  id: string;
  invoiceNumber: string;
}
interface SaleItem {
  id: string;
  quantity: number;
  product: { name: string };
  batch: { batchNumber: string };
}
interface ReturnRow {
  id: string;
  referenceNumber: string;
  status: string;
  totalAmount: string;
  reason?: string | null;
  sale: { invoiceNumber: string };
  items: { id: string; quantity: number; product: { name: string } }[];
  createdAt: string;
}

export function SalesReturnsPage() {
  const { hasPermission } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleId, setSaleId] = useState("");
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [saleItemId, setSaleItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.get<{ data: ReturnRow[] }>("/sales-returns");
    setReturns(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    api.get<{ data: Sale[] }>("/sales").then((res) => setSales(res.data.data));
    load();
  }, []);

  useEffect(() => {
    if (saleId) {
      api.get(`/sales/${saleId}`).then((res) => setSaleItems(res.data.data.items));
    } else {
      setSaleItems([]);
    }
    setSaleItemId("");
  }, [saleId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/sales-returns", { saleId, items: [{ saleItemId, quantity }], reason: reason || undefined });
      setShowForm(false);
      setSaleId("");
      setQuantity(1);
      setReason("");
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create return");
    }
  }

  async function doAction(id: string, action: "approve" | "reject") {
    setError(null);
    try {
      await api.put(`/sales-returns/${id}/${action}`);
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : `Failed to ${action}`);
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { PENDING: "text-bg-warning", APPROVED: "text-bg-success", REJECTED: "text-bg-danger" };
    return <span className={`badge ${map[status] ?? "text-bg-secondary"}`}>{status}</span>;
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Sales Returns</h3>
        {hasPermission("sales_return", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "New return"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Invoice</label>
              <select className="form-select" required value={saleId} onChange={(e) => setSaleId(e.target.value)}>
                <option value="">Select invoice</option>
                {sales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.invoiceNumber}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Item</label>
              <select className="form-select" required value={saleItemId} onChange={(e) => setSaleItemId(e.target.value)}>
                <option value="">Select item</option>
                {saleItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.product.name} ({i.batch.batchNumber}) — sold {i.quantity}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-1">
              <label className="form-label">Qty</label>
              <input type="number" className="form-control" min={1} required value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Reason</label>
              <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }}>
            Save return
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Reference #</th>
              <th>Invoice</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
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
            {returns.map((r) => (
              <tr key={r.id}>
                <td>{r.referenceNumber}</td>
                <td>{r.sale.invoiceNumber}</td>
                <td>
                  {r.items.map((i) => (
                    <div key={i.id} className="small">
                      {i.product.name} × {i.quantity}
                    </div>
                  ))}
                </td>
                <td>₹{r.totalAmount}</td>
                <td>{statusBadge(r.status)}</td>
                <td className="text-end">
                  {r.status === "PENDING" && hasPermission("sales_return", "approve") && (
                    <div className="btn-group">
                      <button className="btn btn-sm btn-outline-success" onClick={() => doAction(r.id, "approve")}>
                        Approve
                      </button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => doAction(r.id, "reject")}>
                        Reject
                      </button>
                    </div>
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
