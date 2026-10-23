import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Purchase {
  id: string;
  referenceNumber: string;
  supplierInvoiceNumber?: string | null;
}
interface PurchaseItem {
  id: string;
  quantity: number;
  lineTotal: string;
  product: { name: string; sku: string };
  batch: { batchNumber: string } | null;
}
interface ReturnRow {
  id: string;
  referenceNumber: string;
  totalAmount: string;
  reason?: string | null;
  supplier: { name: string };
  purchase: { referenceNumber: string };
  items: { id: string; quantity: number; product: { name: string } }[];
  createdAt: string;
}
interface ReturnDraft {
  purchaseItemId: string;
  productName: string;
  sku: string;
  batchNumber: string;
  purchasedQuantity: number;
  quantity: number;
  // Per-unit rate derived from the original purchase line (lineTotal / purchasedQuantity) — same
  // calculation the backend uses, so this preview always matches what actually gets saved.
  unitRate: number;
}

export function PurchaseReturnsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [purchaseId, setPurchaseId] = useState("");
  const [draftItems, setDraftItems] = useState<ReturnDraft[]>([]);
  const [reason, setReason] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => (await api.get<{ data: Purchase[] }>("/purchases")).data.data,
  });

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ["purchase-returns"],
    queryFn: async () => (await api.get<{ data: ReturnRow[] }>("/purchase-returns")).data.data,
  });

  const { data: purchaseItems = [] } = useQuery({
    queryKey: ["purchase-items", purchaseId],
    queryFn: async () => (await api.get(`/purchases/${purchaseId}`)).data.data.items as PurchaseItem[],
    enabled: !!purchaseId,
  });

  // Picking an invoice auto-fills every item bought on it (full quantity, editable) — no more
  // picking a batch one at a time. Remove a row to exclude that product from the return.
  useEffect(() => {
    if (purchaseId && purchaseItems.length > 0) {
      setDraftItems(
        purchaseItems
          .filter((i) => i.batch)
          .map((i) => ({
            purchaseItemId: i.id,
            productName: i.product.name,
            sku: i.product.sku,
            batchNumber: i.batch!.batchNumber,
            purchasedQuantity: i.quantity,
            quantity: i.quantity,
            unitRate: Number(i.lineTotal) / i.quantity,
          }))
      );
    } else {
      setDraftItems([]);
    }
  }, [purchaseId, purchaseItems]);

  function updateDraftQuantity(purchaseItemId: string, quantity: number) {
    setDraftItems((prev) =>
      prev.map((d) => (d.purchaseItemId === purchaseItemId ? { ...d, quantity: Math.max(1, Math.min(quantity, d.purchasedQuantity)) } : d))
    );
  }

  function removeDraftItem(purchaseItemId: string) {
    setDraftItems((prev) => prev.filter((d) => d.purchaseItemId !== purchaseItemId));
  }

  const createMutation = useMutation({
    mutationFn: (payload: { purchaseId: string; items: { purchaseItemId: string; quantity: number }[]; reason?: string }) =>
      api.post("/purchase-returns", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-returns"] });
      // A return immediately reduces the original purchase's totalAmount/paidAmount server-side
      // — refetch so the Purchases list reflects that right away instead of showing the
      // pre-return figures until something else happens to trigger a refetch.
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      setShowForm(false);
      setPurchaseId("");
      setReason("");
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create purchase return");
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (draftItems.length === 0) {
      setError("Add at least one item to return");
      return;
    }
    createMutation.mutate({
      purchaseId,
      items: draftItems.map((d) => ({ purchaseItemId: d.purchaseItemId, quantity: d.quantity })),
      reason: reason || undefined,
    });
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Purchase Returns</h3>
        {hasPermission("purchase_return", "add") && (
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
              <label className="form-label">Purchase invoice</label>
              <select className="form-select" required value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)}>
                <option value="">Select invoice</option>
                {purchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.referenceNumber}
                    {p.supplierInvoiceNumber ? ` (${p.supplierInvoiceNumber})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-7">
              <label className="form-label">Reason</label>
              <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>

          {purchaseId && (
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Batch</th>
                    <th className="text-end">Purchased qty</th>
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
                    <tr key={d.purchaseItemId}>
                      <td>
                        {d.productName}
                        <div className="text-muted small">{d.sku}</div>
                      </td>
                      <td>{d.batchNumber}</td>
                      <td className="text-end">{d.purchasedQuantity}</td>
                      <td>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          min={1}
                          max={d.purchasedQuantity}
                          value={d.quantity}
                          onChange={(e) => updateDraftQuantity(d.purchaseItemId, Number(e.target.value))}
                        />
                      </td>
                      <td className="text-end">₹{(d.unitRate * d.quantity).toFixed(2)}</td>
                      <td>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeDraftItem(d.purchaseItemId)}>
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
              <th>Supplier</th>
              <th>Purchase invoice</th>
              <th>Items</th>
              <th>Total</th>
              <th>Date</th>
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
                <td>{r.supplier.name}</td>
                <td>{r.purchase.referenceNumber}</td>
                <td>
                  {r.items.map((i) => (
                    <div key={i.id} className="small">
                      {i.product.name} × {i.quantity}
                    </div>
                  ))}
                </td>
                <td>₹{r.totalAmount}</td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
