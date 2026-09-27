import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Branch {
  id: string;
  name: string;
}
interface Customer {
  id: string;
  name: string;
}
interface Doctor {
  id: string;
  name: string;
}
interface Prescription {
  id: string;
  prescriptionDate: string;
  customer: { name: string };
  doctor?: { name: string } | null;
  items: { id: string; medicineName: string; dose?: string | null }[];
}

const emptyForm = { branchId: "", customerId: "", doctorId: "", medicineName: "", dose: "" };

export function PrescriptionsPage() {
  const { hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.get<{ data: Prescription[] }>("/prescriptions");
    setPrescriptions(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    Promise.all([api.get<{ data: Branch[] }>("/branches"), api.get<{ data: Customer[] }>("/customers"), api.get<{ data: Doctor[] }>("/doctors")]).then(([b, c, d]) => {
      setBranches(b.data.data);
      setCustomers(c.data.data);
      setDoctors(d.data.data);
    });
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/prescriptions", {
        branchId: form.branchId,
        customerId: form.customerId,
        doctorId: form.doctorId || undefined,
        items: form.medicineName ? [{ medicineName: form.medicineName, dose: form.dose || undefined }] : [],
      });
      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create prescription");
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Prescriptions</h3>
        {hasPermission("prescriptions", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "New prescription"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

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
              <label className="form-label">Customer</label>
              <select className="form-select" required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                <option value="">Select</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Doctor</label>
              <select className="form-select" value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
                <option value="">—</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">Medicine</label>
              <input className="form-control" value={form.medicineName} onChange={(e) => setForm({ ...form, medicineName: e.target.value })} />
            </div>
            <div className="col-md-1">
              <label className="form-label">Dose</label>
              <input className="form-control" value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }}>
            Save
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Doctor</th>
              <th>Medicines</th>
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
            {prescriptions.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.prescriptionDate).toLocaleDateString()}</td>
                <td>{p.customer.name}</td>
                <td>{p.doctor?.name ?? "—"}</td>
                <td>{p.items.map((i) => i.medicineName).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
