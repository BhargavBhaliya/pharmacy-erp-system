import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Customer {
  id: string;
  name: string;
  mobile?: string | null;
  creditLimit: string;
  loyaltyPoints: number;
  isActive: boolean;
}

const emptyForm = { name: "", mobile: "", email: "", creditLimit: 0, creditDays: 0 };

export function CustomersPage() {
  const { hasPermission } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.get<{ data: Customer[] }>("/customers", { params: search ? { search } : {} });
    setCustomers(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/customers", form);
      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create customer");
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Customers</h3>
        {hasPermission("customers", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add customer"}
          </button>
        )}
      </div>

      <form
        className="d-flex gap-2 mb-3"
        style={{ maxWidth: 420 }}
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input className="form-control" placeholder="Search name or mobile..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-outline-secondary" type="submit">
          Search
        </button>
      </form>

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Name</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Mobile</label>
              <input className="form-control" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Credit limit</label>
              <input type="number" className="form-control" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">Credit days</label>
              <input type="number" className="form-control" value={form.creditDays} onChange={(e) => setForm({ ...form, creditDays: Number(e.target.value) })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }}>
            Save customer
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Name</th>
              <th>Mobile</th>
              <th>Credit limit</th>
              <th>Loyalty points</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.mobile ?? "—"}</td>
                <td>₹{c.creditLimit}</td>
                <td>{c.loyaltyPoints}</td>
                <td>
                  <span className={`badge ${c.isActive ? "text-bg-success" : "text-bg-secondary"}`}>{c.isActive ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
