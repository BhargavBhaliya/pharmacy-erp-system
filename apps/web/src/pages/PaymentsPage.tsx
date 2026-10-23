import { useState, type FormEvent } from "react";
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
interface SupplierPayment {
  id: string;
  amount: string;
  paymentMode: string;
  createdAt: string;
  supplier: { name: string };
  allocations: { purchase: { referenceNumber: string }; amount: string }[];
}

export function PaymentsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ branchId: "", partyId: "", amount: 0, paymentMode: "CASH" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get<{ data: Branch[] }>("/branches")).data.data,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await api.get<{ data: Supplier[] }>("/suppliers")).data.data,
  });

  const { data: supplierPayments = [] } = useQuery({
    queryKey: ["supplier-payments"],
    queryFn: async () => (await api.get<{ data: SupplierPayment[] }>("/supplier-payments")).data.data,
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/supplier-payments", body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["supplier-payments"] });
      if (res.data.unallocatedAmount > 0) {
        setInfo(`₹${res.data.unallocatedAmount} could not be applied — no more outstanding invoices.`);
      }
      setShowForm(false);
      setForm({ branchId: "", partyId: "", amount: 0, paymentMode: "CASH" });
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to record payment");
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    createMutation.mutate({ branchId: form.branchId, supplierId: form.partyId, amount: form.amount, paymentMode: form.paymentMode });
  }

  const canAdd = hasPermission("purchase", "edit");

  return (
    <div>
      <h3 className="mb-4">Supplier Payments</h3>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {info && <div className="alert alert-info py-2">{info}</div>}

      {canAdd && (
        <button className="btn btn-primary mb-3" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "New payment"}
        </button>
      )}

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Branch</label>
              <select className="form-select" required value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
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
              <select className="form-select" required value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}>
                <option value="">Select</option>
                {suppliers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Amount</label>
              <input type="number" step="0.01" className="form-control" required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Mode</label>
              <select className="form-select" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                {["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-text">Automatically applied to the oldest outstanding invoices first (FIFO).</div>
          <button type="submit" className="btn btn-primary mt-2" style={{ width: 160 }} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Save"}
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Amount</th>
              <th>Applied to</th>
              <th>Mode</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {supplierPayments.map((p) => (
              <tr key={p.id}>
                <td>{p.supplier.name}</td>
                <td>₹{p.amount}</td>
                <td>{p.allocations.map((a) => `${a.purchase.referenceNumber} (₹${a.amount})`).join(", ") || "—"}</td>
                <td>{p.paymentMode}</td>
                <td>{new Date(p.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
