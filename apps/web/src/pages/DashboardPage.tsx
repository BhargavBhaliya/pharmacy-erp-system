import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";

interface MoneyDoc {
  status?: string;
  totalAmount: string;
  paidAmount: string;
  createdAt: string;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// Dashboard figures change as the day goes on (new sales, stock moving toward expiry), so this
// polls in the background rather than only loading once on mount.
const REFRESH_INTERVAL_MS = 60_000;

export function DashboardPage() {
  const { user, hasPermission } = useAuth();

  const canViewInventory = hasPermission("inventory", "view");
  const canViewExpiry = hasPermission("expiry", "view");
  const canViewSales = hasPermission("sales", "view");
  const canViewPurchase = hasPermission("purchase", "view");
  const canViewCustomers = hasPermission("customers", "view");
  const canViewSuppliers = hasPermission("suppliers", "view");

  const lowStockQuery = useQuery({
    queryKey: ["dashboard", "low-stock"],
    queryFn: async () => (await api.get<{ data: unknown[] }>("/inventory/low-stock")).data.data.length,
    enabled: canViewInventory,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const expiryQuery = useQuery({
    queryKey: ["dashboard", "expiry"],
    queryFn: async () => {
      const res = await api.get("/inventory/expiry");
      return { expiredCount: res.data.summary.expiredCount as number, nearExpiryCount: res.data.summary.nearExpiryCount as number };
    },
    enabled: canViewExpiry,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const salesQuery = useQuery({
    queryKey: ["dashboard", "sales"],
    queryFn: async () => {
      const res = await api.get<{ data: MoneyDoc[] }>("/sales");
      const confirmed = res.data.data.filter((s) => s.status !== "CANCELLED");
      return {
        salesToday: confirmed.filter((s) => isToday(s.createdAt)).reduce((sum, s) => sum + Number(s.totalAmount), 0),
        receivables: confirmed.reduce((sum, s) => sum + (Number(s.totalAmount) - Number(s.paidAmount)), 0),
      };
    },
    enabled: canViewSales,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const purchaseQuery = useQuery({
    queryKey: ["dashboard", "purchases"],
    queryFn: async () => {
      const res = await api.get<{ data: MoneyDoc[] }>("/purchases");
      return {
        purchaseToday: res.data.data.filter((p) => isToday(p.createdAt)).reduce((sum, p) => sum + Number(p.totalAmount), 0),
        payables: res.data.data.reduce((sum, p) => sum + (Number(p.totalAmount) - Number(p.paidAmount)), 0),
      };
    },
    enabled: canViewPurchase,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `₹${v.toFixed(2)}`);

  const cards = [
    { label: "Sales Today", value: money(salesQuery.data?.salesToday), variant: "success", to: canViewSales ? "/sales" : undefined },
    { label: "Purchases Today", value: money(purchaseQuery.data?.purchaseToday), variant: "primary", to: canViewPurchase ? "/purchases" : undefined },
    { label: "Receivables (Customers Owe)", value: money(salesQuery.data?.receivables), variant: "warning", to: canViewCustomers ? "/customers" : undefined },
    { label: "Payables (Owed to Suppliers)", value: money(purchaseQuery.data?.payables), variant: "warning", to: canViewSuppliers ? "/suppliers" : undefined },
    { label: "Low Stock Products", value: lowStockQuery.data ?? "—", variant: "warning", to: canViewInventory ? "/reorder-suggestions" : undefined },
    { label: "Near Expiry Batches", value: expiryQuery.data?.nearExpiryCount ?? "—", variant: "warning", to: canViewExpiry ? "/expiry" : undefined },
    { label: "Expired Batches", value: expiryQuery.data?.expiredCount ?? "—", variant: "danger", to: canViewExpiry ? "/expiry" : undefined },
  ];

  return (
    <div>
      <h3 className="mb-4">Dashboard</h3>
      <div className="alert alert-info">
        Welcome, {user?.name}. Figures above cover the last 200 recent documents per module — full ledger-based
        accounting reports (with date-range filters) land in a later phase.
      </div>
      <div className="row g-3">
        {cards.map((c) => {
          const body = (
            <div className={`card shadow-sm h-100 ${c.to ? "dashboard-card-link" : ""}`}>
              <div className="card-body">
                <div className="text-muted small">{c.label}</div>
                <div className={`fs-5 fw-semibold text-${c.variant}`}>{c.value}</div>
              </div>
            </div>
          );
          return (
            <div key={c.label} className="col-md-4 col-lg-3">
              {c.to ? (
                <Link to={c.to} className="text-decoration-none text-reset d-block h-100">
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
