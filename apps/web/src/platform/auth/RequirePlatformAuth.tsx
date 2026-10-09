import { Navigate, Outlet } from "react-router-dom";
import { usePlatformAuth } from "./PlatformAuthContext";

export function RequirePlatformAuth() {
  const { admin, loading } = usePlatformAuth();

  if (loading) {
    return (
      <div className="d-flex vh-100 align-items-center justify-content-center">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  if (!admin) return <Navigate to="/login" replace />;
  return <Outlet />;
}
