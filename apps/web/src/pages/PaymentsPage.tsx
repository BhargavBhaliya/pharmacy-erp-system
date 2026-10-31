import { useState, type FormEvent } from "react";
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
interface Supplier {
  id: string;
  name: string;
}
interface Purchase {
  id: string;
  referenceNumber: string;
  supplierInvoiceNumber?: string | null;
  supplierId: string;
  totalAmount: string;
  paidAmount: string;
  paymentStatus: string;
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
  const [form, setForm] = useState({ branchId: "", partyId: "", purchaseId: "", amount: 0, paymentMode: "CASH" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await api.get<{ data: Supplier[] }>("/suppliers")).data.data,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => (await api.get<{ data: Purchase[] }>("/purchases")).data.data,
  });

  // Only this supplier's invoices that still owe money — picking one applies the whole payment
  // to it instead of the default oldest-invoice-first behavior.
  const outstandingPurchases = purchases.filter((p) => p.supplierId === form.partyId && p.paymentStatus !== "PAID");

  const { data: supplierPayments = [] } = useQuery({
    queryKey: ["supplier-payments", dateFilter],
    queryFn: async () => {
      const { from, to } = computeDateRange(dateFilter);
      const res = await api.get<{ data: SupplierPayment[] }>("/supplier-payments", {
        params: { ...(from ? { from: from.toISOString() } : {}), ...(to ? { to: to.toISOString() } : {}) },
      });
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/supplier-payments", body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["supplier-payments"] });
      if (res.data.unallocatedAmount > 0) {
        setInfo(`₹${res.data.unallocatedAmount} could not be applied — no more outstanding invoices.`);
      }
      setShowForm(false);
      setForm({ branchId: "", partyId: "", purchaseId: "", amount: 0, paymentMode: "CASH" });
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to record payment");
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    createMutation.mutate({
      branchId: form.branchId,
      supplierId: form.partyId,
      purchaseId: form.purchaseId || undefined,
      amount: form.amount,
      paymentMode: form.paymentMode,
    });
  }

  const canAdd = hasPermission("purchase", "edit");

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
        <h3 className="mb-0">Supplier Payments</h3>
        <DateRangeFilter value={dateFilter} onChange={setDateFilter} />
      </div>

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
              <select
                className="form-select"
                required
                value={form.partyId}
                onChange={(e) => setForm({ ...form, partyId: e.target.value, purchaseId: "" })}
              >
                <option value="">Select</option>
                {suppliers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Against invoice</label>
              <select
                className="form-select"
                value={form.purchaseId}
                disabled={!form.partyId}
                onChange={(e) => setForm({ ...form, purchaseId: e.target.value })}
              >
                <option value="">Oldest outstanding first (auto)</option>
                {outstandingPurchases.map((p) => {
                  const due = Number(p.totalAmount) - Number(p.paidAmount);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.referenceNumber} — due ₹{due.toFixed(2)}
                    </option>
                  );
                })}
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
          <div className="form-text">
            {form.purchaseId ? "Applied entirely to the selected invoice." : "Automatically applied to the oldest outstanding invoices first (FIFO)."}
          </div>
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
