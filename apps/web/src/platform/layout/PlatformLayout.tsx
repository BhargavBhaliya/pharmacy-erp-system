import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { usePlatformAuth } from "../auth/PlatformAuthContext";
import { platformApi } from "../api/platformClient";

const NAV_ITEMS = [
  { to: "/platform/stores", label: "Stores" },
  { to: "/platform/billing", label: "Billing & Subscriptions", badgeKey: "overdue" as const },
];

// Mirrors the tenant AppLayout's left-sidebar shape exactly, but visually distinct (dark
// accent throughout, different brand text) so there is never any ambiguity about which
// "mode" — platform admin vs. inside a store — the current browser tab is in.
export function PlatformLayout() {
  const { admin, logout } = usePlatformAuth();
  const location = useLocation();
  const [overdueCount, setOverdueCount] = useState(0);

  // Refetched on every navigation so renewing a store's plan (from Billing or a store's own
  // detail page) clears the badge without needing a manual page reload.
  useEffect(() => {
    platformApi
      .get<{ data: { isOverdue: boolean }[] }>("/billing-overview")
      .then((res) => setOverdueCount(res.data.data.filter((s) => s.isOverdue).length))
      .catch(() => undefined);
  }, [location.pathname]);

  return (
    <div className="d-flex vh-100">
      <nav className="bg-dark text-white d-flex flex-column p-3" style={{ width: 240, flexShrink: 0, height: "100vh" }}>
        <div className="fs-5 fw-semibold mb-4">Pharmacy ERP<div className="small text-white-50 fw-normal">Platform Admin</div></div>
        <div className="flex-grow-1 overflow-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `d-flex justify-content-between align-items-center px-2 py-2 rounded mb-1 text-decoration-none ${isActive ? "bg-primary text-white" : "text-white-50"}`
              }
            >
              <span>{item.label}</span>
              {item.badgeKey === "overdue" && overdueCount > 0 && <span className="badge text-bg-danger rounded-pill">{overdueCount}</span>}
            </NavLink>
          ))}
        </div>
        <div className="border-top border-secondary pt-3 small">
          <div className="fw-semibold">{admin?.name}</div>
          <div className="text-white-50">{admin?.email}</div>
          <button className="btn btn-outline-light btn-sm mt-2 w-100" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </nav>
      <main className="flex-grow-1 overflow-auto bg-light">
        <div className="container-fluid p-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
