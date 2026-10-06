import { useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { usePlatformAuth } from "../auth/PlatformAuthContext";
import { platformApi } from "../api/platformClient";

const NAV_ITEMS = [
  { to: "/platform/dashboard", label: "Dashboard" },
  { to: "/platform/stores", label: "Stores" },
  { to: "/platform/notifications", label: "Notifications", badgeKey: "overdue" as const },
  { to: "/platform/billing", label: "Billing & Subscriptions" },
  { to: "/platform/settings", label: "Settings" },
];

interface SearchStore {
  id: string;
  storeCode: string;
  businessName: string;
}

// Mirrors the tenant AppLayout's left-sidebar shape exactly, but visually distinct (dark
// accent throughout, different brand text) so there is never any ambiguity about which
// "mode" — platform admin vs. inside a store — the current browser tab is in.
export function PlatformLayout() {
  const { admin, logout } = usePlatformAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimeout = useRef<number>();

  // Shares its queryKey with BillingOverviewPage/NotificationsPage, so recording a payment or
  // renewing a plan anywhere in the app invalidates this cache too — the badge updates itself,
  // no manual per-navigation refetch needed.
  const { data: billingOverview = [] } = useQuery({
    queryKey: ["platform", "billing-overview"],
    queryFn: async () => (await platformApi.get<{ data: { isOverdue: boolean }[] }>("/billing-overview")).data.data,
    refetchInterval: 60_000,
  });
  const overdueCount = billingOverview.filter((s) => s.isOverdue).length;

  const searchQuery = useQuery({
    queryKey: ["platform", "global-search", query],
    queryFn: async () =>
      (await platformApi.get<{ data: SearchStore[] }>("/stores", { params: { search: query, pageSize: 8 } })).data.data,
    enabled: query.trim().length >= 2,
  });
  const results = query.trim().length < 2 ? [] : searchQuery.data ?? [];

  function goToStore(id: string) {
    setQuery("");
    setOpen(false);
    navigate(`/platform/stores/${id}`);
  }

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
        <div className="container-fluid p-3 pb-0">
          <div className="position-relative" style={{ maxWidth: 420 }}>
            <input
              className="form-control"
              placeholder="Search any store by name, code, or email..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                // Delay so a click on a result registers before the dropdown closes.
                blurTimeout.current = window.setTimeout(() => setOpen(false), 150);
              }}
            />
            {open && results.length > 0 && (
              <div className="list-group position-absolute w-100 shadow" style={{ zIndex: 20 }}>
                {results.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="list-group-item list-group-item-action"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      window.clearTimeout(blurTimeout.current);
                      goToStore(s.id);
                    }}
                  >
                    <span className="fw-semibold">{s.storeCode}</span> — {s.businessName}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="container-fluid p-4 pt-3">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
