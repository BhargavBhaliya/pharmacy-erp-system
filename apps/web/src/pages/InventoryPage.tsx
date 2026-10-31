import { memo, useEffect, useMemo, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Branch {
  id: string;
  name: string;
}
interface ProductLite {
  id: string;
  name: string;
  sku: string;
}
interface StockRow {
  productId: string;
  branchId: string;
  productName: string;
  sku: string;
  reorderLevel: number;
  availableQuantity: number;
  expiredQuantity: number;
  isLowStock: boolean;
}
interface Batch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  mrp: string;
  product: { id: string; name: string };
}

const emptyBatchForm = { productId: "", batchNumber: "", expiryDate: "", purchaseRate: 0, mrp: 0, quantity: 0 };
const emptyAdjustForm = { batchId: "", quantityDelta: 0, reason: "CORRECTION", notes: "" };

// Stock levels move as sales/purchases happen elsewhere in the app, so this polls in the
// background rather than only loading once on mount.
const REFRESH_INTERVAL_MS = 60_000;

export function InventoryPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState("");
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchForm, setBatchForm] = useState(emptyBatchForm);
  const [productSearch, setProductSearch] = useState("");
  const [adjustForm, setAdjustForm] = useState<typeof emptyAdjustForm | null>(null);
  const [batchSearch, setBatchSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get<{ data: Branch[] }>("/branches")).data.data,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", "lookup"],
    queryFn: async () => (await api.get<{ data: ProductLite[] }>("/products", { params: { pageSize: 200 } })).data.data,
  });

  // Default to the first branch once branches have loaded, without overriding a selection the
  // user already made.
  useEffect(() => {
    if (!branchId && branches.length > 0) setBranchId(branches[0].id);
  }, [branches, branchId]);

  const stockQuery = useQuery({
    queryKey: ["inventory", "stock", branchId],
    queryFn: async () => (await api.get<{ data: StockRow[] }>("/inventory/stock", { params: { branchId } })).data.data,
    enabled: !!branchId,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const batchesQuery = useQuery({
    queryKey: ["batches", branchId, "available"],
    queryFn: async () => (await api.get<{ data: Batch[] }>("/batches", { params: { branchId, status: "available" } })).data.data,
    enabled: !!branchId,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const stock = stockQuery.data ?? [];
  const batches = batchesQuery.data ?? [];
  const loading = stockQuery.isLoading || batchesQuery.isLoading;

  // Keep the already-selected product/batch in the option list even once it no longer matches
  // the search text — otherwise narrowing the search after picking one snaps the <select> back
  // to blank, which looks like the click never registered.
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const matches = products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    if (batchForm.productId && !matches.some((p) => p.id === batchForm.productId)) {
      const selected = products.find((p) => p.id === batchForm.productId);
      if (selected) return [selected, ...matches];
    }
    return matches;
  }, [products, productSearch, batchForm.productId]);

  const filteredBatches = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    const matches = batches.filter((b) => !q || b.product.name.toLowerCase().includes(q) || b.batchNumber.toLowerCase().includes(q));
    if (adjustForm?.batchId && !matches.some((b) => b.id === adjustForm.batchId)) {
      const selected = batches.find((b) => b.id === adjustForm.batchId);
      if (selected) return [selected, ...matches];
    }
    return matches;
  }, [batches, batchSearch, adjustForm?.batchId]);

  function invalidateInventory() {
    queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
    queryClient.invalidateQueries({ queryKey: ["batches"] });
  }

  const createBatchMutation = useMutation({
    mutationFn: (payload: typeof emptyBatchForm & { branchId: string; expiryDate: string }) => api.post("/batches", payload),
    onSuccess: () => {
      invalidateInventory();
      setShowBatchForm(false);
      setBatchForm(emptyBatchForm);
      setProductSearch("");
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create batch");
    },
  });

  const adjustMutation = useMutation({
    mutationFn: (payload: typeof emptyAdjustForm & { branchId: string }) => api.post("/inventory/adjust", payload),
    onSuccess: () => {
      invalidateInventory();
      setAdjustForm(null);
      setBatchSearch("");
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to adjust stock");
    },
  });

  function handleCreateBatch(e: FormEvent) {
    e.preventDefault();
    createBatchMutation.mutate({ ...batchForm, branchId, expiryDate: new Date(batchForm.expiryDate).toISOString() });
  }

  function handleAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjustForm) return;
    adjustMutation.mutate({ ...adjustForm, branchId });
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <h3 className="mb-0">Inventory</h3>
        <div className="d-flex gap-2">
          <select className="form-select" style={{ width: 220 }} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {hasPermission("batches", "add") && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowBatchForm((s) => !s);
                setProductSearch("");
              }}
            >
              {showBatchForm ? "Cancel" : "New batch"}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {showBatchForm && (
        <form className="card card-body mb-4" onSubmit={handleCreateBatch}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Product</label>
              <input
                className="form-control form-control-sm mb-1"
                placeholder="Search name or SKU..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              <select className="form-select" required value={batchForm.productId} onChange={(e) => setBatchForm({ ...batchForm, productId: e.target.value })}>
                <option value="">Select product</option>
                {filteredProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Batch number</label>
              <input className="form-control" required value={batchForm.batchNumber} onChange={(e) => setBatchForm({ ...batchForm, batchNumber: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Expiry date</label>
              <input type="date" className="form-control" required value={batchForm.expiryDate} onChange={(e) => setBatchForm({ ...batchForm, expiryDate: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Purchase rate</label>
              <input type="number" step="0.01" className="form-control" required value={batchForm.purchaseRate} onChange={(e) => setBatchForm({ ...batchForm, purchaseRate: Number(e.target.value) })} />
            </div>
            <div className="col-md-1">
              <label className="form-label">MRP</label>
              <input type="number" step="0.01" className="form-control" required value={batchForm.mrp} onChange={(e) => setBatchForm({ ...batchForm, mrp: Number(e.target.value) })} />
            </div>
            <div className="col-md-1">
              <label className="form-label">Qty</label>
              <input type="number" className="form-control" required value={batchForm.quantity} onChange={(e) => setBatchForm({ ...batchForm, quantity: Number(e.target.value) })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }} disabled={createBatchMutation.isPending}>
            {createBatchMutation.isPending ? "Saving..." : "Save batch"}
          </button>
        </form>
      )}

      {adjustForm && (
        <form className="card card-body mb-4" onSubmit={handleAdjust}>
          <h6>Adjust stock</h6>
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Batch</label>
              <input
                className="form-control form-control-sm mb-1"
                placeholder="Search product or batch..."
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
              />
              <select className="form-select" required value={adjustForm.batchId} onChange={(e) => setAdjustForm({ ...adjustForm, batchId: e.target.value })}>
                <option value="">Select batch</option>
                {filteredBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.product.name} — {b.batchNumber} (qty {b.quantity})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Quantity (+/-)</label>
              <input type="number" className="form-control" required value={adjustForm.quantityDelta} onChange={(e) => setAdjustForm({ ...adjustForm, quantityDelta: Number(e.target.value) })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Reason</label>
              <select className="form-select" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}>
                {["DAMAGED", "EXPIRED", "LOST", "FOUND", "CORRECTION", "OTHER"].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Notes</label>
              <input className="form-control" value={adjustForm.notes} onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })} />
            </div>
            <div className="col-md-1 d-flex align-items-end">
              <button type="submit" className="btn btn-primary w-100" disabled={adjustMutation.isPending}>
                {adjustMutation.isPending ? "..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      )}

      <StockTable stock={stock} loading={loading} canAdjust={hasPermission("inventory", "stock_adjustment")} onAdjust={() => setAdjustForm({ ...emptyAdjustForm, batchId: "" })} />
    </div>
  );
}

// Memoized so typing in the search boxes above (which re-renders InventoryPage on every
// keystroke) doesn't also re-render the whole stock table.
const StockTable = memo(function StockTable({
  stock,
  loading,
  canAdjust,
  onAdjust,
}: {
  stock: StockRow[];
  loading: boolean;
  canAdjust: boolean;
  onAdjust: () => void;
}) {
  return (
    <div className="card">
      <table className="table mb-0">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th>Available</th>
            <th>Expired</th>
            <th>Reorder level</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={7} className="text-center text-muted py-4">
                Loading...
              </td>
            </tr>
          )}
          {!loading && stock.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-muted py-4">
                No stock recorded for this branch yet.
              </td>
            </tr>
          )}
          {stock.map((row) => (
            <tr key={`${row.productId}-${row.branchId}`}>
              <td>{row.sku}</td>
              <td>{row.productName}</td>
              <td>{row.availableQuantity}</td>
              <td>{row.expiredQuantity > 0 ? <span className="text-danger">{row.expiredQuantity}</span> : 0}</td>
              <td>{row.reorderLevel}</td>
              <td>{row.isLowStock && <span className="badge text-bg-warning">Low stock</span>}</td>
              <td className="text-end">
                {canAdjust && (
                  <button className="btn btn-sm btn-outline-secondary" onClick={onAdjust}>
                    Adjust
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
