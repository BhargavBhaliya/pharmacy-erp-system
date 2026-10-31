import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { NotificationBell } from "./NotificationBell";

const NAV_ITEMS: { to: string; label: string; end?: boolean; module?: string; action?: string }[] = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/pos", label: "POS Billing", module: "pos", action: "add" },
  { to: "/sales", label: "Sales", module: "sales", action: "view" },
  { to: "/sales-returns", label: "Sales Returns", module: "sales_return", action: "view" },
  { to: "/customers", label: "Customers", module: "customers", action: "view" },
  { to: "/products", label: "Products", module: "products", action: "view" },
  { to: "/catalog", label: "Catalog", module: "products", action: "view" },
  { to: "/inventory", label: "Inventory", module: "inventory", action: "view" },
  { to: "/expiry", label: "Expiry", module: "expiry", action: "view" },
  { to: "/reorder-suggestions", label: "Reorder Suggestions", module: "inventory", action: "view" },
  { to: "/purchases", label: "Purchases", module: "purchase", action: "view" },
  { to: "/purchase-returns", label: "Purchase Returns", module: "purchase_return", action: "view" },
  { to: "/stock-transfers", label: "Stock Transfers", module: "stock_transfer", action: "view" },
  { to: "/suppliers", label: "Suppliers", module: "suppliers", action: "view" },
  { to: "/doctors", label: "Doctors", module: "doctors", action: "view" },
  { to: "/prescriptions", label: "Prescriptions", module: "prescriptions", action: "view" },
  { to: "/barcode-labels", label: "Barcode Labels", module: "products", action: "view" },
  { to: "/expenses", label: "Expenses", module: "expenses", action: "view" },
  { to: "/payments", label: "Payments", module: "payments", action: "view" },
  { to: "/cash-sessions", label: "Cash Register", module: "pos", action: "view" },
  { to: "/reports", label: "Reports", module: "reports", action: "view" },
  { to: "/branches", label: "Branches", module: "branches", action: "view" },
  { to: "/users", label: "Users", module: "users", action: "view" },
  { to: "/roles", label: "Roles", module: "roles", action: "view" },
  { to: "/audit-logs", label: "Audit Logs", module: "audit_logs", action: "view" },
  { to: "/settings", label: "Settings", module: "settings", action: "view" },
];

export function AppLayout() {
  const { user, logout, hasPermission } = useAuth();
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.module || hasPermission(item.module, item.action!));

  return (
    <div className="d-flex vh-100">
      <nav className="bg-dark text-white d-flex flex-column p-3" style={{ width: 240, flexShrink: 0, height: "100vh" }}>
        <div className="fs-5 fw-semibold mb-4">Pharmacy ERP</div>
        <div className="flex-grow-1 overflow-auto">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `d-block px-2 py-2 rounded mb-1 text-decoration-none ${
                  isActive ? "bg-primary text-white" : "text-white-50"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="border-top border-secondary pt-3 small">
          <div className="fw-semibold">{user?.name}</div>
          <div className="text-white-50">{user?.email}</div>
          <button className="btn btn-outline-light btn-sm mt-2 w-100" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </nav>
      <main className="flex-grow-1 overflow-auto bg-light">
        <div className="d-flex justify-content-end p-3 pb-0 no-print">
          <NotificationBell />
        </div>
        <div className="container-fluid p-4 pt-2">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
