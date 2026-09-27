import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
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

export function InventoryPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchForm, setBatchForm] = useState(emptyBatchForm);
  const [adjustForm, setAdjustForm] = useState<typeof emptyAdjustForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadStock(forBranch: string) {
    setLoading(true);
    const [stockRes, batchesRes] = await Promise.all([
      api.get<{ data: StockRow[] }>("/inventory/stock", { params: { branchId: forBranch } }),
      api.get<{ data: Batch[] }>("/batches", { params: { branchId: forBranch, status: "available" } }),
    ]);
    setStock(stockRes.data.data);
    setBatches(batchesRes.data.data);
    setLoading(false);
  }

  useEffect(() => {
    Promise.all([api.get<{ data: Branch[] }>("/branches"), api.get<{ data: ProductLite[] }>("/products", { params: { pageSize: 200 } })]).then(
      ([b, p]) => {
        setBranches(b.data.data);
        setProducts(p.data.data);
        if (b.data.data.length > 0) {
          setBranchId(b.data.data[0].id);
        }
      }
    );
  }, []);

  useEffect(() => {
    if (branchId) loadStock(branchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  async function handleCreateBatch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/batches", { ...batchForm, branchId, expiryDate: new Date(batchForm.expiryDate).toISOString() });
      setShowBatchForm(false);
      setBatchForm(emptyBatchForm);
      await loadStock(branchId);
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create batch");
    }
  }

  async function handleAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjustForm) return;
    setError(null);
    try {
      await api.post("/inventory/adjust", { ...adjustForm, branchId });
      setAdjustForm(null);
      await loadStock(branchId);
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to adjust stock");
    }
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
            <button className="btn btn-primary" onClick={() => setShowBatchForm((s) => !s)}>
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
              <select className="form-select" required value={batchForm.productId} onChange={(e) => setBatchForm({ ...batchForm, productId: e.target.value })}>
                <option value="">Select product</option>
                {products.map((p) => (
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
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }}>
            Save batch
          </button>
        </form>
      )}

      {adjustForm && (
        <form className="card card-body mb-4" onSubmit={handleAdjust}>
          <h6>Adjust stock</h6>
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Batch</label>
              <select className="form-select" required value={adjustForm.batchId} onChange={(e) => setAdjustForm({ ...adjustForm, batchId: e.target.value })}>
                <option value="">Select batch</option>
                {batches.map((b) => (
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
              <button type="submit" className="btn btn-primary w-100">
                Save
              </button>
            </div>
          </div>
        </form>
      )}

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
                  {hasPermission("inventory", "stock_adjustment") && (
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setAdjustForm({ ...emptyAdjustForm, batchId: "" })}>
                      Adjust
                    </button>
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
