import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
}

// A cashier needs to know promptly if their session state changed (e.g. closed from another
// device), so this polls in the background rather than relying solely on the default staleTime.
const REFRESH_INTERVAL_MS = 30_000;

export function CashSessionsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState("");
  const [openingAmount, setOpeningAmount] = useState(0);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closingAmount, setClosingAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get<{ data: Branch[] }>("/branches")).data.data,
  });

  // Default to the first branch once branches load, same as the original mount-time behavior.
  useEffect(() => {
    if (branches.length > 0 && !branchId) setBranchId(branches[0].id);
  }, [branches, branchId]);

  const { data: counters = [] } = useQuery({
    queryKey: ["counters", branchId],
    queryFn: async () => (await api.get<{ data: Counter[] }>("/counters", { params: { branchId } })).data.data,
    enabled: !!branchId,
  });

  // Each branch has a single default counter (no multi-counter setup) — use it
  // automatically instead of asking the cashier to pick one.
  const counterId = counters[0]?.id ?? "";

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["cash-sessions"],
    queryFn: async () => (await api.get<{ data: CashSession[] }>("/cash-sessions")).data.data,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const openMutation = useMutation({
    mutationFn: (payload: { branchId: string; counterId: string; openingAmount: number }) => api.post("/cash-sessions", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-sessions"] });
      setOpeningAmount(0);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to open session");
    },
  });

  const closeMutation = useMutation({
    mutationFn: (payload: { id: string; closingAmount: number }) => api.put(`/cash-sessions/${payload.id}/close`, { closingAmount: payload.closingAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-sessions"] });
      setClosingId(null);
      setClosingAmount(0);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to close session");
    },
  });

  function handleOpen(e: FormEvent) {
    e.preventDefault();
    openMutation.mutate({ branchId, counterId, openingAmount });
  }

  function handleClose(id: string) {
    closeMutation.mutate({ id, closingAmount });
  }

  return (
    <div>
      <h3 className="mb-4">Cash Register</h3>
      {error && <div className="alert alert-danger py-2">{error}</div>}

      {hasPermission("pos", "add") && (
        <form className="card card-body mb-4" onSubmit={handleOpen}>
          <h6>Open a cash session</h6>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Branch</label>
              <select className="form-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Opening amount</label>
              <input type="number" step="0.01" className="form-control" required value={openingAmount} onChange={(e) => setOpeningAmount(Number(e.target.value))} />
            </div>
            <div className="col-md-4 d-flex align-items-end">
              <button type="submit" className="btn btn-primary w-100" disabled={!counterId || openMutation.isPending}>
                {openMutation.isPending ? "Opening..." : "Open session"}
              </button>
            </div>
            {!counterId && branchId && <div className="col-12 text-danger small">This branch has no counter set up yet.</div>}
          </div>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Branch</th>
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
            {isLoading && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.branch.name}</td>
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
                        <button className="btn btn-sm btn-primary" onClick={() => handleClose(s.id)} disabled={closeMutation.isPending}>
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
