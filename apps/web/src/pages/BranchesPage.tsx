import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Branch {
  id: string;
  name: string;
  address?: string | null;
  gstin?: string | null;
  contactNumber?: string | null;
  isActive: boolean;
}

export function BranchesPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", gstin: "", contactNumber: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.get<{ data: Branch[] }>("/branches");
    setBranches(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/branches", form);
      setShowForm(false);
      setForm({ name: "", address: "", gstin: "", contactNumber: "" });
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create branch");
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Branches</h3>
        {hasPermission("branches", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add branch"}
          </button>
        )}
      </div>

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Branch name</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Contact number</label>
              <input className="form-control" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">GSTIN</label>
              <input className="form-control" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Address</label>
              <input className="form-control" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }}>
            Save branch
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Name</th>
              <th>GSTIN</th>
              <th>Contact</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && branches.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-4">
                  No branches yet.
                </td>
              </tr>
            )}
            {branches.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td>{b.gstin ?? "—"}</td>
                <td>{b.contactNumber ?? "—"}</td>
                <td>
                  <span className={`badge ${b.isActive ? "text-bg-success" : "text-bg-secondary"}`}>
                    {b.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
