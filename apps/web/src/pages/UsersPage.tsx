import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface RoleOption {
  id: string;
  name: string;
}
interface BranchOption {
  id: string;
  name: string;
}
interface UserRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  role: { id: string; name: string };
  userBranches: { branch: { id: string; name: string } }[];
}

const emptyForm = { name: "", email: "", password: "", roleId: "", branchIds: [] as string[] };

export function UsersPage() {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [usersRes, rolesRes, branchesRes] = await Promise.all([
      api.get<{ data: UserRow[] }>("/users"),
      api.get<{ data: RoleOption[] }>("/roles"),
      api.get<{ data: BranchOption[] }>("/branches").catch(() => ({ data: { data: [] as BranchOption[] } })),
    ]);
    setUsers(usersRes.data.data);
    setRoles(rolesRes.data.data);
    setBranches(branchesRes.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function toggleBranch(id: string) {
    setForm((f) => ({
      ...f,
      branchIds: f.branchIds.includes(id) ? f.branchIds.filter((b) => b !== id) : [...f.branchIds, id],
    }));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/users", form);
      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create user");
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Users</h3>
        {hasPermission("users", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add user"}
          </button>
        )}
      </div>

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Name</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Temporary password</label>
              <input type="password" className="form-control" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Role</label>
              <select className="form-select" required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                <option value="">Select a role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label d-block">Branch access</label>
              {branches.map((b) => (
                <div className="form-check form-check-inline" key={b.id}>
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={`branch-${b.id}`}
                    checked={form.branchIds.includes(b.id)}
                    onChange={() => toggleBranch(b.id)}
                  />
                  <label className="form-check-label" htmlFor={`branch-${b.id}`}>
                    {b.name}
                  </label>
                </div>
              ))}
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }}>
            Save user
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Branches</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <span className="badge text-bg-light border">{u.role.name}</span>
                </td>
                <td>{u.userBranches.map((ub) => ub.branch.name).join(", ") || "—"}</td>
                <td>
                  <span className={`badge ${u.isActive ? "text-bg-success" : "text-bg-secondary"}`}>
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
