import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { computeDateRange, toDateInput, toMonthInput, type DateFilterValue } from "../lib/dateRangeFilter";

interface Branch {
  id: string;
  name: string;
}
interface Batch {
  id: string;
  batchNumber: string;
  quantity: number;
  product: { id: string; name: string; sku: string };
}
interface Transfer {
  id: string;
  status: string;
  fromBranch: { name: string };
  toBranch: { name: string };
  items: { id: string; quantity: number; product: { name: string }; batch: { batchNumber: string } }[];
  createdAt: string;
}

const emptyForm = { fromBranchId: "", toBranchId: "", batchId: "", quantity: 1 };

export function StockTransfersPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [batchSearch, setBatchSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({
    mode: "all",
    day: toDateInput(new Date()),
    month: toMonthInput(new Date()),
    year: String(new Date().getFullYear()),
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get<{ data: Branch[] }>("/branches")).data.data,
  });

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ["stock-transfers", branchFilter, dateFilter],
    queryFn: async () => {
      const { from, to } = computeDateRange(dateFilter);
      const res = await api.get<{ data: Transfer[] }>("/stock-transfers", {
        params: {
          ...(branchFilter ? { branchId: branchFilter } : {}),
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
      });
      return res.data.data;
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches", form.fromBranchId, "available"],
    queryFn: async () => (await api.get<{ data: Batch[] }>("/batches", { params: { branchId: form.fromBranchId, status: "available" } })).data.data,
    enabled: !!form.fromBranchId,
  });

  useEffect(() => {
    setBatchSearch("");
  }, [form.fromBranchId]);

  const filteredBatches = batches.filter((b) => {
    const q = batchSearch.trim().toLowerCase();
    if (!q) return true;
    return b.product.name.toLowerCase().includes(q) || b.product.sku.toLowerCase().includes(q) || b.batchNumber.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (batchSearch.trim().length >= 2 && filteredBatches.length === 1) {
      setForm((prev) => ({ ...prev, batchId: filteredBatches[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchSearch, batches]);

  function invalidateTransfers() {
    queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
    queryClient.invalidateQueries({ queryKey: ["batches"] });
    queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
  }

  const createMutation = useMutation({
    mutationFn: (payload: { fromBranchId: string; toBranchId: string; items: { productId: string; batchId: string; quantity: number }[] }) =>
      api.post("/stock-transfers", payload),
    onSuccess: () => {
      invalidateTransfers();
      setShowForm(false);
      setForm(emptyForm);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create transfer");
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" | "dispatch" | "receive" }) =>
      api.put(`/stock-transfers/${id}/${action}`),
    onSuccess: () => {
      invalidateTransfers();
      setError(null);
    },
    onError: (err, variables) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : `Failed to ${variables.action}`);
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const batch = batches.find((b) => b.id === form.batchId);
    if (!batch) {
      setError("Select a batch");
      return;
    }
    createMutation.mutate({
      fromBranchId: form.fromBranchId,
      toBranchId: form.toBranchId,
      items: [{ productId: batch.product.id, batchId: batch.id, quantity: form.quantity }],
    });
  }

  function doAction(id: string, action: "approve" | "reject" | "dispatch" | "receive") {
    actionMutation.mutate({ id, action });
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      REQUESTED: "text-bg-secondary",
      APPROVED: "text-bg-info",
      DISPATCHED: "text-bg-warning",
      RECEIVED: "text-bg-success",
      REJECTED: "text-bg-danger",
      CANCELLED: "text-bg-danger",
    };
    return <span className={`badge ${map[status] ?? "text-bg-secondary"}`}>{status}</span>;
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
        <h3 className="mb-0">Stock Transfers</h3>
        {hasPermission("stock_transfer", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "New transfer"}
          </button>
        )}
      </div>

      <div className="d-flex align-items-center gap-2 flex-wrap mb-3">
        <select className="form-select form-select-sm" style={{ width: 180 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">From branch</label>
              <select className="form-select" required value={form.fromBranchId} onChange={(e) => setForm({ ...form, fromBranchId: e.target.value, batchId: "" })}>
                <option value="">Select</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">To branch</label>
              <select className="form-select" required value={form.toBranchId} onChange={(e) => setForm({ ...form, toBranchId: e.target.value })}>
                <option value="">Select</option>
                {branches.filter((b) => b.id !== form.fromBranchId).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Batch</label>
              <input
                className="form-control form-control-sm mb-1"
                placeholder="Scan barcode or search product/batch..."
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                disabled={!form.fromBranchId}
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
            <div className="col-md-2">
              <label className="form-label">Quantity</label>
              <input type="number" className="form-control" min={1} required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Request transfer"}
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Items</th>
              <th>Status</th>
              <th>Requested</th>
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
            {transfers.map((t) => (
              <tr key={t.id}>
                <td>{t.fromBranch.name}</td>
                <td>{t.toBranch.name}</td>
                <td>
                  {t.items.map((i) => (
                    <div key={i.id} className="small">
                      {i.product.name} ({i.batch.batchNumber}) × {i.quantity}
                    </div>
                  ))}
                </td>
                <td>{statusBadge(t.status)}</td>
                <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="text-end">
                  <div className="btn-group">
                    {t.status === "REQUESTED" && hasPermission("stock_transfer", "approve") && (
                      <>
                        <button className="btn btn-sm btn-outline-success" onClick={() => doAction(t.id, "approve")}>
                          Approve
                        </button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => doAction(t.id, "reject")}>
                          Reject
                        </button>
                      </>
                    )}
                    {t.status === "APPROVED" && hasPermission("stock_transfer", "add") && (
                      <button className="btn btn-sm btn-outline-primary" onClick={() => doAction(t.id, "dispatch")}>
                        Dispatch
                      </button>
                    )}
                    {t.status === "DISPATCHED" && hasPermission("stock_transfer", "add") && (
                      <button className="btn btn-sm btn-outline-primary" onClick={() => doAction(t.id, "receive")}>
                        Receive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
