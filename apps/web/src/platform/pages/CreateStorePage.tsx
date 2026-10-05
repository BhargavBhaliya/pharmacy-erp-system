import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { platformApi } from "../api/platformClient";

function generatePassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 12);
}

export function CreateStorePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ businessName: "", ownerName: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await platformApi.post("/stores", {
        businessName: form.businessName,
        ownerName: form.ownerName,
        email: form.email,
        phone: form.phone || undefined,
        password: form.password,
      });
      navigate(`/platform/stores/${res.data.tenant.id}`, { replace: true });
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create store");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h3 className="mb-4">New Store</h3>
      <form className="card card-body" style={{ maxWidth: 560 }} onSubmit={handleSubmit}>
        {error && <div className="alert alert-danger py-2">{error}</div>}

        <label className="form-label">Business name</label>
        <input className="form-control mb-3" required value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />

        <label className="form-label">Owner name</label>
        <input className="form-control mb-3" required value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />

        <label className="form-label">Owner login email</label>
        <input type="email" className="form-control mb-3" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

        <label className="form-label">Phone</label>
        <input className="form-control mb-3" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

        <label className="form-label">Owner login password</label>
        <div className="d-flex gap-2 mb-3">
          <input
            className="form-control"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button type="button" className="btn btn-outline-secondary text-nowrap" onClick={() => setForm({ ...form, password: generatePassword() })}>
            Generate
          </button>
        </div>
        <div className="form-text mb-3">
          This becomes the store owner's first login. Share it with them securely — it won't be shown again after creation.
        </div>

        <button type="submit" className="btn btn-dark" disabled={submitting} style={{ width: 160 }}>
          {submitting ? "Creating..." : "Create store"}
        </button>
      </form>
    </div>
  );
}
