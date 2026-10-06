import { useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Supplier {
  id: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  gstin?: string | null;
  creditLimit: string;
  creditDays: number;
  isActive: boolean;
}

const emptyForm = { name: "", contactPerson: "", phone: "", gstin: "", creditLimit: 0, creditDays: 0 };

export function SuppliersPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await api.get<{ data: Supplier[] }>("/suppliers")).data.data,
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof emptyForm) => api.post("/suppliers", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setShowForm(false);
      setForm(emptyForm);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create supplier");
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate(form);
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Suppliers</h3>
        {hasPermission("suppliers", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add supplier"}
          </button>
        )}
      </div>

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Supplier / company name</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Contact person</label>
              <input className="form-control" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Phone</label>
              <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">GSTIN</label>
              <input className="form-control" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Credit limit</label>
              <input type="number" className="form-control" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Credit days</label>
              <input type="number" className="form-control" value={form.creditDays} onChange={(e) => setForm({ ...form, creditDays: Number(e.target.value) })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Save supplier"}
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>GSTIN</th>
              <th>Credit</th>
              <th>Status</th>
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
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.contactPerson ?? "—"}</td>
                <td>{s.phone ?? "—"}</td>
                <td>{s.gstin ?? "—"}</td>
                <td>
                  ₹{s.creditLimit} / {s.creditDays}d
                </td>
                <td>
                  <span className={`badge ${s.isActive ? "text-bg-success" : "text-bg-secondary"}`}>{s.isActive ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
