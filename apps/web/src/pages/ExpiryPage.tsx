import { useEffect, useState } from "react";
import { api } from "../api/client";

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
  branch: { name: string };
}

export function ExpiryPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [windowDays, setWindowDays] = useState(90);
  const [batches, setBatches] = useState<ExpiryBatch[]>([]);
  const [summary, setSummary] = useState({ expiredCount: 0, nearExpiryCount: 0 });
  const [loading, setLoading] = useState(true);

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
            {!loading && batches.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
