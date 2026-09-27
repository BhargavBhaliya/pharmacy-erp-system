import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Branch {
  id: string;
  name: string;
}
interface Category {
  id: string;
  name: string;
}
interface Expense {
  id: string;
  amount: string;
  paymentMode: string;
  status: string;
  description?: string | null;
  category: { name: string };
  branch: { name: string };
  createdAt: string;
}

const emptyForm = { branchId: "", categoryId: "", amount: 0, paymentMode: "CASH", description: "" };

export function ExpensesPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [expRes, catRes] = await Promise.all([api.get<{ data: Expense[] }>("/expenses"), api.get<{ data: Category[] }>("/expense-categories")]);
    setExpenses(expRes.data.data);
    setCategories(catRes.data.data);
    setLoading(false);
  }

  useEffect(() => {
    api.get<{ data: Branch[] }>("/branches").then((res) => setBranches(res.data.data));
    load();
  }, []);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategoryName) return;
    await api.post("/expense-categories", { name: newCategoryName });
    setNewCategoryName("");
    await load();
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/expenses", form);
      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to record expense");
    }
  }

  async function doAction(id: string, action: "approve" | "reject") {
    await api.put(`/expenses/${id}/${action}`);
    await load();
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { PENDING: "text-bg-warning", APPROVED: "text-bg-success", REJECTED: "text-bg-danger" };
    return <span className={`badge ${map[status] ?? "text-bg-secondary"}`}>{status}</span>;
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Expenses</h3>
        {hasPermission("expenses", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Record expense"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      <form className="d-flex gap-2 mb-3" style={{ maxWidth: 360 }} onSubmit={addCategory}>
        <input className="form-control form-control-sm" placeholder="New category (e.g. Rent)" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
        <button className="btn btn-sm btn-outline-secondary" type="submit">
          Add category
        </button>
      </form>

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
              <label className="form-label">Category</label>
              <select className="form-select" required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Select</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Amount</label>
              <input type="number" step="0.01" className="form-control" required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Payment mode</label>
              <select className="form-select" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                {["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Description</label>
              <input className="form-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }}>
            Save expense
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Category</th>
              <th>Branch</th>
              <th>Amount</th>
              <th>Mode</th>
              <th>Status</th>
              <th>Date</th>
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
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.category.name}
                  {e.description && <div className="text-muted small">{e.description}</div>}
                </td>
                <td>{e.branch.name}</td>
                <td>₹{e.amount}</td>
                <td>{e.paymentMode}</td>
                <td>{statusBadge(e.status)}</td>
                <td>{new Date(e.createdAt).toLocaleDateString()}</td>
                <td className="text-end">
                  {e.status === "PENDING" && hasPermission("expenses", "approve") && (
                    <div className="btn-group">
                      <button className="btn btn-sm btn-outline-success" onClick={() => doAction(e.id, "approve")}>
                        Approve
                      </button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => doAction(e.id, "reject")}>
                        Reject
                      </button>
                    </div>
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
