import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

interface Permission {
  id: string;
  module: string;
  action: string;
  code: string;
}
interface RoleRow {
  id: string;
  name: string;
  isSystem: boolean;
  discountLimitPercent: string;
  userCount: number;
  permissionCodes: string[];
}

export function RolesPage() {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [draftCodes, setDraftCodes] = useState<Set<string>>(new Set());

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => (await api.get<{ data: RoleRow[] }>("/roles")).data.data,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["roles", "catalog"],
    queryFn: async () => (await api.get<{ data: Permission[] }>("/roles/catalog")).data.data,
  });

  const savePermissionsMutation = useMutation({
    mutationFn: ({ roleId, permissionCodes }: { roleId: string; permissionCodes: string[] }) =>
      api.put(`/roles/${roleId}/permissions`, { permissionCodes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const modules = useMemo(() => Array.from(new Set(catalog.map((p) => p.module))), [catalog]);

  function selectRole(role: RoleRow) {
    setSelectedRoleId(role.id);
    setDraftCodes(new Set(role.permissionCodes));
  }

  function toggle(code: string) {
    setDraftCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function save() {
    if (!selectedRoleId) return;
    savePermissionsMutation.mutate({ roleId: selectedRoleId, permissionCodes: Array.from(draftCodes) });
  }

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  return (
    <div>
      <h3 className="mb-4">Roles &amp; Permissions</h3>
      <div className="row g-4">
        <div className="col-md-3">
          <div className="card">
            <div className="list-group list-group-flush">
              {isLoading && <div className="p-3 text-muted">Loading...</div>}
              {roles.map((r) => (
                <button
                  key={r.id}
                  className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                    selectedRoleId === r.id ? "active" : ""
                  }`}
                  onClick={() => selectRole(r)}
                >
                  {r.name}
                  <span className="badge text-bg-secondary">{r.userCount}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="col-md-9">
          {!selectedRole && <div className="text-muted">Select a role to view/edit its permissions.</div>}
          {selectedRole && (
            <div className="card">
              <div className="card-header d-flex justify-content-between align-items-center">
                <div>
                  <strong>{selectedRole.name}</strong>
                  {selectedRole.isSystem && <span className="badge text-bg-light border ms-2">Default role</span>}
                </div>
                <button className="btn btn-primary btn-sm" disabled={savePermissionsMutation.isPending} onClick={save}>
                  {savePermissionsMutation.isPending ? "Saving..." : "Save permissions"}
                </button>
              </div>
              <div className="card-body" style={{ maxHeight: 520, overflowY: "auto" }}>
                {modules.map((module) => (
                  <div key={module} className="mb-3">
                    <div className="text-uppercase text-muted small fw-semibold mb-1">{module.replace(/_/g, " ")}</div>
                    <div>
                      {catalog
                        .filter((p) => p.module === module)
                        .map((p) => (
                          <div className="form-check form-check-inline" key={p.id}>
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id={`perm-${p.id}`}
                              checked={draftCodes.has(p.code)}
                              onChange={() => toggle(p.code)}
                            />
                            <label className="form-check-label" htmlFor={`perm-${p.id}`}>
                              {p.action}
                            </label>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
