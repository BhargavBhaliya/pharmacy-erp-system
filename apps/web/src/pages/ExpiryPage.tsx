import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Branch {
  id: string;
  name: string;
}
interface ExpiryBatch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  isExpired: boolean;
  daysUntilExpiry: number;
  product: { name: string; sku: string };
  branch: { id: string; name: string };
}

export function ExpiryPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [windowDays, setWindowDays] = useState(90);
  const [batches, setBatches] = useState<ExpiryBatch[]>([]);
  const [summary, setSummary] = useState({ expiredCount: 0, nearExpiryCount: 0 });
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeQty, setRemoveQty] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: Branch[] }>("/branches").then((res) => setBranches(res.data.data));
  }, []);

  async function load() {
    setLoading(true);
    const res = await api.get("/inventory/expiry", { params: { branchId: branchId || undefined, windowDays } });
    setBatches(res.data.data);
    setSummary(res.data.summary);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, windowDays]);

  function startRemove(b: ExpiryBatch) {
    setActionError(null);
    setRemovingId(b.id);
    setRemoveQty(b.quantity);
  }

  async function confirmRemove(b: ExpiryBatch) {
    setActionError(null);
    if (removeQty <= 0 || removeQty > b.quantity) {
      setActionError(`Enter a quantity between 1 and ${b.quantity}`);
      return;
    }
    setRemoving(true);
    try {
      await api.post("/inventory/adjust", {
        branchId: b.branch.id,
        batchId: b.id,
        quantityDelta: -removeQty,
        reason: "EXPIRED",
        notes: "Removed via Expiry Management screen",
      });
      setRemovingId(null);
      await load();
    } catch (err) {
      setActionError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to remove stock");
    } finally {
      setRemoving(false);
    }
  }

  const canAdjust = hasPermission("inventory", "stock_adjustment");

  return (
    <div>
      <h3 className="mb-4">Expiry Management</h3>

      <div className="d-flex gap-2 mb-4 flex-wrap align-items-end">
        <div>
          <label className="form-label d-block">Branch</label>
          <select className="form-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">All accessible branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label d-block">Warning window (days)</label>
          <select className="form-select" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
            {[30, 60, 90, 180].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card card-body">
            <div className="text-muted small">Already expired</div>
            <div className="fs-4 fw-semibold text-danger">{summary.expiredCount}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card card-body">
            <div className="text-muted small">Near expiry ({windowDays}d)</div>
            <div className="fs-4 fw-semibold text-warning">{summary.nearExpiryCount}</div>
          </div>
        </div>
      </div>

      {actionError && <div className="alert alert-danger py-2">{actionError}</div>}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Product</th>
              <th>Batch</th>
              <th>Branch</th>
              <th>Expiry date</th>
              <th>Qty</th>
              <th>Status</th>
              {canAdjust && <th></th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={canAdjust ? 7 : 6} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && batches.length === 0 && (
              <tr>
                <td colSpan={canAdjust ? 7 : 6} className="text-center text-muted py-4">
                  Nothing expiring in this window.
                </td>
              </tr>
            )}
            {batches.map((b) => (
              <tr key={b.id}>
                <td>
                  {b.product.name}
                  <div className="text-muted small">{b.product.sku}</div>
                </td>
                <td>{b.batchNumber}</td>
                <td>{b.branch.name}</td>
                <td>{new Date(b.expiryDate).toLocaleDateString()}</td>
                <td>{b.quantity}</td>
                <td>
                  {b.isExpired ? (
                    <span className="badge text-bg-danger">Expired</span>
                  ) : (
                    <span className="badge text-bg-warning">{b.daysUntilExpiry}d left</span>
                  )}
                </td>
                {canAdjust && (
                  <td className="text-end" style={{ minWidth: 220 }}>
                    {b.isExpired &&
                      (removingId === b.id ? (
                        <div className="d-flex gap-1 justify-content-end align-items-center">
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            style={{ width: 70 }}
                            min={1}
                            max={b.quantity}
                            value={removeQty}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => setRemoveQty(Number(e.target.value))}
                          />
                          <button className="btn btn-sm btn-danger" disabled={removing} onClick={() => confirmRemove(b)}>
                            {removing ? "..." : "Confirm"}
                          </button>
                          <button className="btn btn-sm btn-outline-secondary" onClick={() => setRemovingId(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button className="btn btn-sm btn-outline-danger" onClick={() => startRemove(b)}>
                          Remove from stock
                        </button>
                      ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
