import { useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Doctor {
  id: string;
  name: string;
  specialization?: string | null;
  hospitalClinic?: string | null;
  phone?: string | null;
  isActive: boolean;
}

const emptyForm = { name: "", specialization: "", hospitalClinic: "", phone: "" };

export function DoctorsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: doctors = [], isLoading } = useQuery({
    queryKey: ["doctors"],
    queryFn: async () => (await api.get<{ data: Doctor[] }>("/doctors")).data.data,
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof emptyForm) => api.post("/doctors", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      setShowForm(false);
      setForm(emptyForm);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create doctor");
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate(form);
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Doctors</h3>
        {hasPermission("doctors", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add doctor"}
          </button>
        )}
      </div>

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Name</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Specialization</label>
              <input className="form-control" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Hospital / Clinic</label>
              <input className="form-control" value={form.hospitalClinic} onChange={(e) => setForm({ ...form, hospitalClinic: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Phone</label>
              <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Save doctor"}
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Name</th>
              <th>Specialization</th>
              <th>Hospital/Clinic</th>
              <th>Phone</th>
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
            {doctors.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{d.specialization ?? "—"}</td>
                <td>{d.hospitalClinic ?? "—"}</td>
                <td>{d.phone ?? "—"}</td>
                <td>
                  <span className={`badge ${d.isActive ? "text-bg-success" : "text-bg-secondary"}`}>{d.isActive ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
