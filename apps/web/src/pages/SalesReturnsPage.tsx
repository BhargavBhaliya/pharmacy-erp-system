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
  lineTotal: string;
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
interface ReturnDraft {
  saleItemId: string;
  productName: string;
  sku: string;
  batchNumber: string;
  soldQuantity: number;
  quantity: number;
  // Per-unit rate derived from the original sale line (lineTotal / soldQuantity) — same
  // calculation the backend uses, so this preview always matches what actually gets saved.
  unitRate: number;
}

export function SalesReturnsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [saleId, setSaleId] = useState("");
  const [draftItems, setDraftItems] = useState<ReturnDraft[]>([]);
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

  // Picking an invoice auto-fills every item it sold (full quantity, editable) — no more
  // scanning/searching one item at a time. Remove a row to exclude that product from the return.
  useEffect(() => {
    if (saleId && saleItems.length > 0) {
      setDraftItems(
        saleItems.map((i) => ({
          saleItemId: i.id,
          productName: i.product.name,
          sku: i.product.sku,
          batchNumber: i.batch.batchNumber,
          soldQuantity: i.quantity,
          quantity: i.quantity,
          unitRate: Number(i.lineTotal) / i.quantity,
        }))
      );
    } else {
      setDraftItems([]);
    }
  }, [saleId, saleItems]);

  function updateDraftQuantity(saleItemId: string, quantity: number) {
    setDraftItems((prev) =>
      prev.map((d) => (d.saleItemId === saleItemId ? { ...d, quantity: Math.max(1, Math.min(quantity, d.soldQuantity)) } : d))
    );
  }

  function removeDraftItem(saleItemId: string) {
    setDraftItems((prev) => prev.filter((d) => d.saleItemId !== saleItemId));
  }

  const createMutation = useMutation({
    mutationFn: (payload: { saleId: string; items: { saleItemId: string; quantity: number }[]; reason?: string }) =>
      api.post("/sales-returns", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-returns"] });
      // A return that auto-approves immediately reduces the original sale's totalAmount/
      // paidAmount server-side — refetch so the Sales list reflects that right away instead of
      // showing the pre-return figures until something else happens to trigger a refetch.
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      setShowForm(false);
      setSaleId("");
      setReason("");
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create return");
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (draftItems.length === 0) {
      setError("Add at least one item to return");
      return;
    }
    createMutation.mutate({
      saleId,
      items: draftItems.map((d) => ({ saleItemId: d.saleItemId, quantity: d.quantity })),
      reason: reason || undefined,
    });
  }

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) => api.put(`/sales-returns/${id}/${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-returns"] });
      // Approving (not rejecting) also reduces the original sale's totals server-side.
      queryClient.invalidateQueries({ queryKey: ["sales"] });
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
          <div className="row g-3 mb-2">
            <div className="col-md-5">
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
            <div className="col-md-7">
              <label className="form-label">Reason</label>
              <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>

          {saleId && (
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th className="text-end">Sold qty</th>
                    <th style={{ width: 110 }}>Return qty</th>
                    <th className="text-end">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {draftItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-3">
                        All items removed — add the invoice again or close this form.
                      </td>
                    </tr>
                  )}
                  {draftItems.map((d) => (
                    <tr key={d.saleItemId}>
                      <td>
                        {d.productName}
                        <div className="text-muted small">{d.sku}</div>
                      </td>
                      <td>{d.batchNumber}</td>
                      <td className="text-end">{d.soldQuantity}</td>
                      <td>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          min={1}
                          max={d.soldQuantity}
                          value={d.quantity}
                          onChange={(e) => updateDraftQuantity(d.saleItemId, Number(e.target.value))}
                        />
                      </td>
                      <td className="text-end">₹{(d.unitRate * d.quantity).toFixed(2)}</td>
                      <td>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeDraftItem(d.saleItemId)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {draftItems.length > 0 && (
                  <tfoot>
                    <tr className="fw-semibold">
                      <td colSpan={4} className="text-end">
                        Total return amount
                      </td>
                      <td className="text-end">₹{draftItems.reduce((sum, d) => sum + d.unitRate * d.quantity, 0).toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }} disabled={createMutation.isPending || draftItems.length === 0}>
            {createMutation.isPending ? "Saving..." : "Save return"}
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
