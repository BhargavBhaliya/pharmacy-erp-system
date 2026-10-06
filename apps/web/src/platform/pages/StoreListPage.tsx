import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { platformApi } from "../api/platformClient";

interface Store {
  id: string;
  storeCode: string;
  businessName: string;
  ownerName: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  branchCount: number;
  subscriptionStatus: string;
  nextDueDate: string | null;
  isOverdue: boolean;
}

const SUBSCRIPTION_BADGE: Record<string, string> = {
  TRIAL: "text-bg-info",
  ACTIVE: "text-bg-success",
  PAST_DUE: "text-bg-warning",
  EXPIRED: "text-bg-danger",
  CANCELLED: "text-bg-secondary",
  NO_PLAN: "text-bg-light border",
};

export function StoreListPage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await platformApi.get<{ data: Store[] }>("/stores", {
      params: { ...(search ? { search } : {}), ...(activeFilter ? { isActive: activeFilter } : {}) },
    });
    setStores(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    load();
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Stores</h3>
        <Link to="/platform/stores/new" className="btn btn-dark">
          + New store
        </Link>
      </div>

      <form className="d-flex gap-2 mb-3" onSubmit={handleSearch} style={{ maxWidth: 560 }}>
        <input
          className="form-control"
          placeholder="Search by store code, business name, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-select" style={{ width: 150 }} value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)}>
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <button className="btn btn-outline-secondary" type="submit">
          Search
        </button>
      </form>

      <div className="card">
        <table className="table table-hover mb-0">
          <thead>
            <tr>
              <th>Store Code</th>
              <th>Business Name</th>
              <th>Owner</th>
              <th>Users</th>
              <th>Branches</th>
              <th>Status</th>
              <th>Billing</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && stores.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  No stores found.
                </td>
              </tr>
            )}
            {stores.map((s) => (
              <tr key={s.id} role="button" style={{ cursor: "pointer" }} onClick={() => navigate(`/platform/stores/${s.id}`)}>
                <td className="fw-semibold">{s.storeCode}</td>
                <td>{s.businessName}</td>
                <td>{s.ownerName ?? "—"}</td>
                <td>{s.userCount}</td>
                <td>{s.branchCount}</td>
                <td>
                  <span className={`badge ${s.isActive ? "text-bg-success" : "text-bg-secondary"}`}>
                    {s.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td>
                  <span className={`badge ${SUBSCRIPTION_BADGE[s.subscriptionStatus] ?? "text-bg-light border"}`}>
                    {s.subscriptionStatus.replace("_", " ")}
                  </span>
                  {s.nextDueDate && (
                    <div className={`small mt-1 ${s.isOverdue ? "text-danger fw-semibold" : "text-muted"}`}>
                      {s.isOverdue ? "Overdue: " : "Due "}
                      {new Date(s.nextDueDate).toLocaleDateString()}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
