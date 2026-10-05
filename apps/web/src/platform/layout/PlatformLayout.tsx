import { Link, Outlet } from "react-router-dom";
import { usePlatformAuth } from "../auth/PlatformAuthContext";

// Deliberately visually distinct from the tenant AppLayout (no sidebar, different accent
// color) so there is never any ambiguity about which "mode" — platform admin vs. inside a
// store — the current browser tab is in.
export function PlatformLayout() {
  const { admin, logout } = usePlatformAuth();

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-dark bg-dark px-4">
        <Link to="/platform/stores" className="navbar-brand mb-0 h1">
          Pharmacy ERP — Platform Admin
        </Link>
        <div className="d-flex align-items-center gap-3 text-white-50 small">
          <span>{admin?.name}</span>
          <span>{admin?.email}</span>
          <button className="btn btn-outline-light btn-sm" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </nav>
      <div className="container-fluid p-4">
        <Outlet />
      </div>
    </div>
  );
}
