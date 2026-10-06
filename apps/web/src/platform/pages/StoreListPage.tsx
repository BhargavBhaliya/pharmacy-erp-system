import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformApi } from "../api/platformClient";
import { Pagination } from "../components/Pagination";

const PAGE_SIZE = 10;

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
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["platform", "stores", search, activeFilter, page],
    queryFn: async () =>
      (
        await platformApi.get<{ data: Store[]; pagination: { total: number } }>("/stores", {
          params: {
            ...(search ? { search } : {}),
            ...(activeFilter ? { isActive: activeFilter } : {}),
            page,
            pageSize: PAGE_SIZE,
          },
        })
      ).data,
  });
  const stores = data?.data ?? [];
  const total = data?.pagination.total ?? 0;

  const bulkMutation = useMutation({
    mutationFn: (payload: { tenantIds: string[]; activate: boolean }) =>
      platformApi.post<{ data: { updatedCount: number } }>(`/stores/${payload.activate ? "bulk-activate" : "bulk-deactivate"}`, {
        tenantIds: payload.tenantIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform", "stores"] });
      setSelectedIds([]);
    },
  });

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleActiveFilterChange(value: "" | "true" | "false") {
    setActiveFilter(value);
    setPage(1);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === stores.length ? [] : stores.map((s) => s.id)));
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className="form-select"
          style={{ width: 150 }}
          value={activeFilter}
          onChange={(e) => handleActiveFilterChange(e.target.value as "" | "true" | "false")}
        >
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <button className="btn btn-outline-secondary" type="submit">
          Search
        </button>
      </form>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <div className="text-muted small">{isLoading ? "Loading..." : `${total} store(s) · page ${page} of ${totalPages}`}</div>
        {selectedIds.length > 0 && (
          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted">{selectedIds.length} selected</span>
            <button
              className="btn btn-sm btn-outline-success"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate({ tenantIds: selectedIds, activate: true })}
            >
              Activate
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate({ tenantIds: selectedIds, activate: false })}
            >
              Deactivate
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <table className="table table-hover mb-0">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={stores.length > 0 && selectedIds.length === stores.length}
                  onChange={toggleSelectAll}
                />
              </th>
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
            {isLoading && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && stores.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  No stores found.
                </td>
              </tr>
            )}
            {stores.map((s) => (
              <tr key={s.id}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggleSelected(s.id)}
                  />
                </td>
                <td className="fw-semibold" role="button" style={{ cursor: "pointer" }} onClick={() => navigate(`/platform/stores/${s.id}`)}>
                  {s.storeCode}
                </td>
                <td role="button" style={{ cursor: "pointer" }} onClick={() => navigate(`/platform/stores/${s.id}`)}>
                  {s.businessName}
                </td>
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

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
