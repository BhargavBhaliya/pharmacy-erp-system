import { useAuth } from "../auth/AuthContext";

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <h3 className="mb-4">Dashboard</h3>
      <div className="alert alert-info">
        Welcome, {user?.name}. This is Phase 1 (foundation: tenants, branches, auth, RBAC, audit log). Sales,
        inventory, purchase and reporting cards will appear here once those modules are built.
      </div>
      <div className="row g-3">
        {["Sales Today", "Purchase Today", "Low Stock", "Near Expiry", "Receivables", "Payables"].map((label) => (
          <div key={label} className="col-md-4">
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="text-muted small">{label}</div>
                <div className="fs-4 fw-semibold text-body-tertiary">— (TODO: module not built yet)</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
