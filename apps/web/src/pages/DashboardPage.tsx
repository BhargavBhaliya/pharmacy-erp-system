import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);
  const [expiredCount, setExpiredCount] = useState<number | null>(null);
  const [nearExpiryCount, setNearExpiryCount] = useState<number | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inventoryCards = [
    { label: "Low Stock Products", value: lowStockCount, variant: "warning" },
    { label: "Near Expiry Batches", value: nearExpiryCount, variant: "warning" },
    { label: "Expired Batches", value: expiredCount, variant: "danger" },
  ];
  const todoCards = ["Sales Today", "Purchase Today", "Receivables", "Payables"];

  return (
    <div>
      <h3 className="mb-4">Dashboard</h3>
      <div className="alert alert-info">
        Welcome, {user?.name}. Product & inventory tracking is live. Sales, purchase, and accounting cards below are
        placeholders until those modules are built.
      </div>
      <div className="row g-3 mb-3">
        {inventoryCards.map((c) => (
          <div key={c.label} className="col-md-4">
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="text-muted small">{c.label}</div>
                <div className={`fs-4 fw-semibold text-${c.value ? c.variant : "body-tertiary"}`}>
                  {c.value === null ? "—" : c.value}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="row g-3">
        {todoCards.map((label) => (
          <div key={label} className="col-md-3">
            <div className="card shadow-sm">
              <div className="card-body">
                <div className="text-muted small">{label}</div>
                <div className="fs-6 fw-semibold text-body-tertiary">TODO: module not built yet</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
