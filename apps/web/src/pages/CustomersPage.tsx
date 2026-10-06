import { useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  // Cached per search term: revisiting the page (or clearing the search back to a term you
  // already searched) shows the previous result instantly while it quietly revalidates, instead
  // of a fresh loading spinner every time.
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers", search],
    queryFn: async () => (await api.get<{ data: Customer[] }>("/customers", { params: search ? { search } : {} })).data.data,
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof emptyForm) => api.post("/customers", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowForm(false);
      setForm(emptyForm);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create customer");
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate(form);
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
          setSearch(searchInput);
        }}
      >
        <input className="form-control" placeholder="Search name or mobile..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
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
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Save customer"}
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
            {isLoading && (
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
