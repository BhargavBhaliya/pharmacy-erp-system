import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Sale {
  id: string;
  invoiceNumber: string;
}
interface SaleItem {
  id: string;
  quantity: number;
  product: { name: string; sku: string };
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
  const queryClient = useQueryClient();
  const [saleId, setSaleId] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [saleItemId, setSaleItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => (await api.get<{ data: Sale[] }>("/sales")).data.data,
  });

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ["sales-returns"],
    queryFn: async () => (await api.get<{ data: ReturnRow[] }>("/sales-returns")).data.data,
  });

  const { data: saleItems = [] } = useQuery({
    queryKey: ["sale-items", saleId],
    queryFn: async () => (await api.get(`/sales/${saleId}`)).data.data.items as SaleItem[],
    enabled: !!saleId,
  });

  useEffect(() => {
    setSaleItemId("");
    setItemSearch("");
  }, [saleId]);

  const filteredSaleItems = saleItems.filter((i) => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return true;
    return i.product.name.toLowerCase().includes(q) || i.product.sku.toLowerCase().includes(q) || i.batch.batchNumber.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (itemSearch.trim().length >= 2 && filteredSaleItems.length === 1) {
      setSaleItemId(filteredSaleItems[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSearch, saleItems]);

  const createMutation = useMutation({
    mutationFn: (payload: { saleId: string; items: { saleItemId: string; quantity: number }[]; reason?: string }) =>
      api.post("/sales-returns", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-returns"] });
      setShowForm(false);
      setSaleId("");
      setQuantity(1);
      setReason("");
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create return");
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate({ saleId, items: [{ saleItemId, quantity }], reason: reason || undefined });
  }

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) => api.put(`/sales-returns/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-returns"] });
      setError(null);
    },
    onError: (err, variables) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : `Failed to ${variables.action}`);
    },
  });

  function doAction(id: string, action: "approve" | "reject") {
    actionMutation.mutate({ id, action });
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
              <input
                className="form-control form-control-sm mb-1"
                placeholder="Scan barcode or search product..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                disabled={!saleId}
              />
              <select className="form-select" required value={saleItemId} onChange={(e) => setSaleItemId(e.target.value)}>
                <option value="">Select item</option>
                {filteredSaleItems.map((i) => (
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
            {isLoading && (
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
