import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Branch {
  id: string;
  name: string;
}
interface Counter {
  id: string;
  name: string;
}
interface CashSession {
  id: string;
  status: string;
  openingAmount: string;
  closingAmount?: string | null;
  expectedClosingAmount?: string | null;
  variance?: string | null;
  openedAt: string;
  closedAt?: string | null;
  branch: { name: string };
  counter: { name: string };
}

export function CashSessionsPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [branchId, setBranchId] = useState("");
  const [counterId, setCounterId] = useState("");
  const [openingAmount, setOpeningAmount] = useState(0);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closingAmount, setClosingAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.get<{ data: CashSession[] }>("/cash-sessions");
    setSessions(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    api.get<{ data: Branch[] }>("/branches").then((res) => {
      setBranches(res.data.data);
      if (res.data.data.length > 0) setBranchId(res.data.data[0].id);
    });
    load();
  }, []);

  useEffect(() => {
    if (branchId) {
      api.get<{ data: Counter[] }>("/counters", { params: { branchId } }).then((res) => setCounters(res.data.data));
    }
  }, [branchId]);

  async function handleOpen(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/cash-sessions", { branchId, counterId, openingAmount });
      setOpeningAmount(0);
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to open session");
    }
  }

  async function handleClose(id: string) {
    setError(null);
    try {
      await api.put(`/cash-sessions/${id}/close`, { closingAmount });
      setClosingId(null);
      setClosingAmount(0);
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to close session");
    }
  }

  return (
    <div>
      <h3 className="mb-4">Cash / Counter Management</h3>
      {error && <div className="alert alert-danger py-2">{error}</div>}

      {hasPermission("pos", "add") && (
        <form className="card card-body mb-4" onSubmit={handleOpen}>
          <h6>Open a cash session</h6>
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Branch</label>
              <select className="form-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Counter</label>
              <select className="form-select" required value={counterId} onChange={(e) => setCounterId(e.target.value)}>
                <option value="">Select</option>
                {counters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Opening amount</label>
              <input type="number" step="0.01" className="form-control" required value={openingAmount} onChange={(e) => setOpeningAmount(Number(e.target.value))} />
            </div>
            <div className="col-md-3 d-flex align-items-end">
              <button type="submit" className="btn btn-primary w-100">
                Open session
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Branch</th>
              <th>Counter</th>
              <th>Opened</th>
              <th>Opening</th>
              <th>Expected</th>
              <th>Closing</th>
              <th>Variance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.branch.name}</td>
                <td>{s.counter.name}</td>
                <td>{new Date(s.openedAt).toLocaleString()}</td>
                <td>₹{s.openingAmount}</td>
                <td>{s.expectedClosingAmount ? `₹${s.expectedClosingAmount}` : "—"}</td>
                <td>{s.closingAmount ? `₹${s.closingAmount}` : "—"}</td>
                <td>
                  {s.variance ? (
                    <span className={Number(s.variance) < 0 ? "text-danger" : "text-success"}>₹{s.variance}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span className={`badge ${s.status === "OPEN" ? "text-bg-success" : "text-bg-secondary"}`}>{s.status}</span>
                </td>
                <td className="text-end">
                  {s.status === "OPEN" && hasPermission("pos", "add") && (
                    closingId === s.id ? (
                      <div className="d-flex gap-1 justify-content-end">
                        <input type="number" className="form-control form-control-sm" style={{ width: 100 }} value={closingAmount} onChange={(e) => setClosingAmount(Number(e.target.value))} />
                        <button className="btn btn-sm btn-primary" onClick={() => handleClose(s.id)}>
                          Close
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setClosingId(s.id)}>
                        Close session
                      </button>
                    )
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
