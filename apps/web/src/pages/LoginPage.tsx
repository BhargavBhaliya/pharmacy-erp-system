import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePlatformAuth } from "../platform/auth/PlatformAuthContext";
import { isAxiosError } from "axios";

// One login form for both account types: a Platform Admin and a store user are entirely
// separate systems under the hood (separate tables, separate JWT secrets — see
// PlatformAuthContext's own comment), but there is no reason to make a person pick the right
// *page* first. Try the store login; if that's not who this is, try Platform Admin; whichever
// one actually matches these credentials decides where to land.
export function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const { login: platformLogin, admin, loading: platformLoading } = usePlatformAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loading = authLoading || platformLoading;
  if (!loading && user) return <Navigate to="/" replace />;
  if (!loading && admin) return <Navigate to="/platform/dashboard" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
      return;
    } catch {
      // Not a store login — fall through and see if it's the Platform Admin instead.
    }
    try {
      await platformLogin(email, password);
      navigate("/platform/dashboard", { replace: true });
    } catch (err) {
      const message = isAxiosError(err) ? err.response?.data?.error?.message : undefined;
      setError(message ?? "Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  }

  function handlePasswordChange(e: ChangeEvent<HTMLInputElement>) {
    setPassword(e.target.value);
  }

  return (
    <div className="d-flex vh-100 align-items-center justify-content-center bg-light">
      <div className="card shadow-sm" style={{ width: 380 }}>
        <div className="card-body p-4">
          <h4 className="mb-1">Pharmacy ERP</h4>
          <p className="text-muted mb-4">Sign in to your workspace</p>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Email or Username</label>
              <input type="text" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <div className="input-group">
                <input
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  value={password}
                  onChange={handlePasswordChange}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  tabIndex={-1}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <div className="text-center mt-3 small">
            <Link to="/register">Register a new business</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
