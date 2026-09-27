import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";

export function RegisterBusinessPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ businessName: "", ownerName: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/auth/register-business", form);
      await login(form.email, form.password);
      navigate("/", { replace: true });
    } catch (err) {
      const message = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(message ?? "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="d-flex vh-100 align-items-center justify-content-center bg-light">
      <div className="card shadow-sm" style={{ width: 420 }}>
        <div className="card-body p-4">
          <h4 className="mb-1">Create your pharmacy workspace</h4>
          <p className="text-muted mb-4">Sets up a tenant, a main branch, default roles, and your admin account.</p>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Business name</label>
              <input
                className="form-control"
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Your name</label>
              <input
                className="form-control"
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
              {submitting ? "Creating..." : "Create workspace"}
            </button>
          </form>
          <div className="text-center mt-3 small">
            <Link to="/login">Already have an account? Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
