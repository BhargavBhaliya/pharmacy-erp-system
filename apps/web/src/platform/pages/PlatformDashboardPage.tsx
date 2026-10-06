import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { platformApi } from "../api/platformClient";

interface DashboardSummary {
  storeStats: { total: number; active: number; inactive: number };
  subscriptionStats: Record<string, number>;
  collection: { totalCollected: number; collectedThisMonth: number; pendingDues: number; overdueStoreCount: number };
  monthlyCollection: { month: string; amount: number }[];
  recentPayments: { id: string; amount: string; paymentDate: string; storeName: string; storeCode: string }[];
}

const STATUS_COLOR: Record<string, string> = {
  TRIAL: "#0dcaf0",
  ACTIVE: "#198754",
  PAST_DUE: "#ffc107",
  EXPIRED: "#dc3545",
  CANCELLED: "#6c757d",
  NO_PLAN: "#adb5bd",
};

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// Dependency-free bar chart: plain divs with heights proportional to the max value.
function BarChart({ data }: { data: { month: string; amount: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  return (
    <div className="d-flex align-items-end gap-3" style={{ height: 160 }}>
      {data.map((d) => (
        <div key={d.month} className="d-flex flex-column align-items-center flex-grow-1">
          <div className="small text-muted mb-1">{d.amount > 0 ? `₹${d.amount}` : ""}</div>
          <div
            className="bg-dark rounded-top w-100"
            style={{ height: `${Math.max(2, (d.amount / max) * 120)}px`, minWidth: 24 }}
            title={`${monthLabel(d.month)}: ₹${d.amount}`}
          />
          <div className="small text-muted mt-1">{monthLabel(d.month)}</div>
        </div>
      ))}
    </div>
  );
}

// Dependency-free donut: a conic-gradient circle built from the status breakdown.
function StatusDonut({ stats }: { stats: Record<string, number> }) {
  const entries = Object.entries(stats).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return <div className="text-muted small">No subscriptions yet.</div>;

  let acc = 0;
  const segments = entries.map(([status, value]) => {
    const start = (acc / total) * 360;
    acc += value;
    const end = (acc / total) * 360;
    return `${STATUS_COLOR[status] ?? "#ccc"} ${start}deg ${end}deg`;
  });

  return (
    <div className="d-flex align-items-center gap-3">
      <div style={{ width: 110, height: 110, borderRadius: "50%", background: `conic-gradient(${segments.join(", ")})` }} />
      <div className="small">
        {entries.map(([status, value]) => (
          <div key={status} className="d-flex align-items-center gap-2 mb-1">
            <span style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_COLOR[status] ?? "#ccc", display: "inline-block" }} />
            <span>
              {status.replace("_", " ")}: {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlatformDashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    platformApi.get<{ data: DashboardSummary }>("/dashboard").then((res) => setData(res.data.data));
  }, []);

  if (!data) return <div className="text-muted">Loading...</div>;

  return (
    <div>
      <h3 className="mb-4">Dashboard</h3>

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card card-body">
            <div className="text-muted small">Total stores</div>
            <div className="fs-3 fw-semibold">{data.storeStats.total}</div>
            <div className="small text-muted">
              {data.storeStats.active} active · {data.storeStats.inactive} inactive
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card card-body">
            <div className="text-muted small">Total collected</div>
            <div className="fs-3 fw-semibold text-success">₹{data.collection.totalCollected}</div>
            <div className="small text-muted">₹{data.collection.collectedThisMonth} this month</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card card-body">
            <div className="text-muted small">Pending dues</div>
            <div className="fs-3 fw-semibold text-danger">₹{data.collection.pendingDues}</div>
            <Link to="/platform/notifications" className="small">
              {data.collection.overdueStoreCount} store(s) overdue
            </Link>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card card-body">
            <div className="text-muted small">Active subscriptions</div>
            <div className="fs-3 fw-semibold">{data.subscriptionStats.ACTIVE ?? 0}</div>
            <Link to="/platform/billing" className="small">
              View all plans
            </Link>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-7">
          <div className="card card-body">
            <h6 className="mb-3">Collection — last 6 months</h6>
            <BarChart data={data.monthlyCollection} />
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card card-body">
            <h6 className="mb-3">Subscription status</h6>
            <StatusDonut stats={data.subscriptionStats} />
          </div>
        </div>
      </div>

      <div className="card card-body">
        <h6 className="mb-3">Recent payments</h6>
        {data.recentPayments.length === 0 && <div className="text-muted small">No payments recorded yet.</div>}
        {data.recentPayments.map((p) => (
          <div key={p.id} className="d-flex justify-content-between small border-bottom py-1">
            <span>
              {p.storeName} <span className="text-muted">({p.storeCode})</span>
            </span>
            <span>
              ₹{p.amount} · {new Date(p.paymentDate).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
