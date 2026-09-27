import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="d-flex vh-100 align-items-center justify-content-center">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequirePermission({ module, action, children }: { module: string; action: string; children: React.ReactNode }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(module, action)) {
    return (
      <div className="alert alert-warning m-4" role="alert">
        You do not have permission to view this page.
      </div>
    );
  }
  return <>{children}</>;
}
