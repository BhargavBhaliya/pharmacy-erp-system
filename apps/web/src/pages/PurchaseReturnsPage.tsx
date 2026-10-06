import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Branch {
  id: string;
  name: string;
}
interface Supplier {
  id: string;
  name: string;
}
interface Batch {
  id: string;
  batchNumber: string;
  quantity: number;
  purchaseRate: string;
  product: { id: string; name: string; sku: string };
}
interface ReturnRow {
  id: string;
  referenceNumber: string;
  totalAmount: string;
  reason?: string | null;
  supplier: { name: string };
  branch: { name: string };
  items: { id: string; quantity: number; product: { name: string }; batch: { batchNumber: string } }[];
  createdAt: string;
}

const emptyForm = { branchId: "", supplierId: "", batchId: "", quantity: 1, reason: "" };

export function PurchaseReturnsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [batchSearch, setBatchSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get<{ data: Branch[] }>("/branches")).data.data,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await api.get<{ data: Supplier[] }>("/suppliers")).data.data,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches", form.branchId],
    queryFn: async () => (await api.get<{ data: Batch[] }>("/batches", { params: { branchId: form.branchId, status: "available" } })).data.data,
    enabled: !!form.branchId,
  });

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ["purchase-returns"],
    queryFn: async () => (await api.get<{ data: ReturnRow[] }>("/purchase-returns")).data.data,
  });

  // Clear the batch search box whenever the selected branch changes, matching the fresh batch list.
  useEffect(() => {
    setBatchSearch("");
  }, [form.branchId]);

  const filteredBatches = batches.filter((b) => {
    const q = batchSearch.trim().toLowerCase();
    if (!q) return true;
    return b.product.name.toLowerCase().includes(q) || b.product.sku.toLowerCase().includes(q) || b.batchNumber.toLowerCase().includes(q);
  });

  // Scanning a barcode/SKU narrows this down to one row — select it automatically so the
  // cashier doesn't also have to touch the dropdown.
  useEffect(() => {
    if (batchSearch.trim().length >= 2 && filteredBatches.length === 1) {
      setForm((prev) => ({ ...prev, batchId: filteredBatches[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchSearch, batches]);

  const createMutation = useMutation({
    mutationFn: (payload: { branchId: string; supplierId: string; reason?: string; items: { productId: string; batchId: string; quantity: number; rate: number }[] }) =>
      api.post("/purchase-returns", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-returns"] });
      setShowForm(false);
      setForm(emptyForm);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create purchase return");
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const batch = batches.find((b) => b.id === form.batchId);
    if (!batch) {
      setError("Select a batch");
      return;
    }
    createMutation.mutate({
      branchId: form.branchId,
      supplierId: form.supplierId,
      reason: form.reason || undefined,
      items: [{ productId: batch.product.id, batchId: batch.id, quantity: form.quantity, rate: Number(batch.purchaseRate) }],
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
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Branch</label>
              <select className="form-select" required value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value, batchId: "" })}>
                <option value="">Select</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Supplier</label>
              <select className="form-select" required value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">Select</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Batch</label>
              <input
                className="form-control form-control-sm mb-1"
                placeholder="Scan barcode or search product/batch..."
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                disabled={!form.branchId}
              />
              <select className="form-select" required value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}>
                <option value="">Select batch</option>
                {filteredBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.product.name} — {b.batchNumber} (avail {b.quantity})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-1">
              <label className="form-label">Qty</label>
              <input type="number" className="form-control" min={1} required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Reason</label>
              <input className="form-control" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }} disabled={createMutation.isPending}>
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
              <th>Branch</th>
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
                <td>{r.branch.name}</td>
                <td>
                  {r.items.map((i) => (
                    <div key={i.id} className="small">
                      {i.product.name} ({i.batch.batchNumber}) × {i.quantity}
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
