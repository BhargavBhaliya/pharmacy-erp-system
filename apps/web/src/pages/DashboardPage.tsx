import { useEffect, useState } from "react";
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

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);
  const [expiredCount, setExpiredCount] = useState<number | null>(null);
  const [nearExpiryCount, setNearExpiryCount] = useState<number | null>(null);
  const [salesToday, setSalesToday] = useState<number | null>(null);
  const [purchaseToday, setPurchaseToday] = useState<number | null>(null);
  const [receivables, setReceivables] = useState<number | null>(null);
  const [payables, setPayables] = useState<number | null>(null);

  useEffect(() => {
    if (hasPermission("inventory", "view")) {
      api.get<{ data: unknown[] }>("/inventory/low-stock").then((res) => setLowStockCount(res.data.data.length));
    }
    if (hasPermission("expiry", "view")) {
      api.get("/inventory/expiry").then((res) => {
        setExpiredCount(res.data.summary.expiredCount);
        setNearExpiryCount(res.data.summary.nearExpiryCount);
      });
    }
    if (hasPermission("sales", "view")) {
      api.get<{ data: MoneyDoc[] }>("/sales").then((res) => {
        const confirmed = res.data.data.filter((s) => s.status !== "CANCELLED");
        setSalesToday(confirmed.filter((s) => isToday(s.createdAt)).reduce((sum, s) => sum + Number(s.totalAmount), 0));
        setReceivables(confirmed.reduce((sum, s) => sum + (Number(s.totalAmount) - Number(s.paidAmount)), 0));
      });
    }
    if (hasPermission("purchase", "view")) {
      api.get<{ data: MoneyDoc[] }>("/purchases").then((res) => {
        setPurchaseToday(res.data.data.filter((p) => isToday(p.createdAt)).reduce((sum, p) => sum + Number(p.totalAmount), 0));
        setPayables(res.data.data.reduce((sum, p) => sum + (Number(p.totalAmount) - Number(p.paidAmount)), 0));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const money = (v: number | null) => (v === null ? "—" : `₹${v.toFixed(2)}`);

  const cards = [
    { label: "Sales Today", value: money(salesToday), variant: "success" },
    { label: "Purchases Today", value: money(purchaseToday), variant: "primary" },
    { label: "Receivables (Customers Owe)", value: money(receivables), variant: "warning" },
    { label: "Payables (Owed to Suppliers)", value: money(payables), variant: "warning" },
    { label: "Low Stock Products", value: lowStockCount ?? "—", variant: "warning" },
    { label: "Near Expiry Batches", value: nearExpiryCount ?? "—", variant: "warning" },
    { label: "Expired Batches", value: expiredCount ?? "—", variant: "danger" },
  ];

  return (
    <div>
      <h3 className="mb-4">Dashboard</h3>
      <div className="alert alert-info">
        Welcome, {user?.name}. Figures above cover the last 200 recent documents per module — full ledger-based
        accounting reports (with date-range filters) land in a later phase.
      </div>
      <div className="row g-3">
        {cards.map((c) => (
          <div key={c.label} className="col-md-4 col-lg-3">
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="text-muted small">{c.label}</div>
                <div className={`fs-5 fw-semibold text-${c.variant}`}>{c.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
