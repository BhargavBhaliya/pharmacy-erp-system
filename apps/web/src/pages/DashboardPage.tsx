import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";
import { computeDateRange } from "../lib/dateRangeFilter";

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

  // Computed server-side via DB aggregates (see /sales/summary, /purchases/summary) rather than
  // paging through the sales/purchases list and summing in JS — that approach silently
  // under-reported receivables/payables once a tenant had more than 200 documents, since older
  // unpaid invoices fell outside the capped page.
  const salesQuery = useQuery({
    queryKey: ["dashboard", "sales"],
    queryFn: async () => {
      const { from, to } = computeDateRange({ mode: "today", day: "", month: "", year: "" });
      const res = await api.get<{ data: { periodTotal: number; receivables: number } }>("/sales/summary", {
        params: { from: from?.toISOString(), to: to?.toISOString() },
      });
      return { salesToday: res.data.data.periodTotal, receivables: res.data.data.receivables };
    },
    enabled: canViewSales,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const purchaseQuery = useQuery({
    queryKey: ["dashboard", "purchases"],
    queryFn: async () => {
      const { from, to } = computeDateRange({ mode: "today", day: "", month: "", year: "" });
      const res = await api.get<{ data: { periodTotal: number; payables: number } }>("/purchases/summary", {
        params: { from: from?.toISOString(), to: to?.toISOString() },
      });
      return { purchaseToday: res.data.data.periodTotal, payables: res.data.data.payables };
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
        Welcome, {user?.name}. Full ledger-based accounting reports (with date-range filters) land in a later phase.
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
