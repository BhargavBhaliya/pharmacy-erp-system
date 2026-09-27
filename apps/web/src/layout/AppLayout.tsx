import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/pos", label: "POS Billing" },
  { to: "/sales", label: "Sales" },
  { to: "/sales-returns", label: "Sales Returns" },
  { to: "/customers", label: "Customers" },
  { to: "/doctors", label: "Doctors" },
  { to: "/prescriptions", label: "Prescriptions" },
  { to: "/products", label: "Products" },
  { to: "/catalog", label: "Catalog" },
  { to: "/inventory", label: "Inventory" },
  { to: "/expiry", label: "Expiry" },
  { to: "/stock-transfers", label: "Stock Transfers" },
  { to: "/purchase-orders", label: "Purchase Orders" },
  { to: "/purchases", label: "Purchases" },
  { to: "/purchase-returns", label: "Purchase Returns" },
  { to: "/suppliers", label: "Suppliers" },
  { to: "/expenses", label: "Expenses" },
  { to: "/payments", label: "Payments" },
  { to: "/cash-sessions", label: "Cash / Counters" },
  { to: "/branches", label: "Branches" },
  { to: "/users", label: "Users" },
  { to: "/roles", label: "Roles" },
  { to: "/audit-logs", label: "Audit Logs" },
];

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="d-flex vh-100">
      <nav className="bg-dark text-white d-flex flex-column p-3" style={{ width: 240, flexShrink: 0 }}>
        <div className="fs-5 fw-semibold mb-4">Pharmacy ERP</div>
        <div className="flex-grow-1">
          {NAV_ITEMS.map((item) => (
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
        <div className="container-fluid p-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
