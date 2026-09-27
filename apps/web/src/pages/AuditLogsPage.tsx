import { useEffect, useState } from "react";
import { api } from "../api/client";

interface AuditLogRow {
  id: string;
  module: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: AuditLogRow[] }>("/audit-logs").then((res) => {
      setLogs(res.data.data);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <h3 className="mb-4">Audit Logs</h3>
      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Module</th>
              <th>Action</th>
              <th>Entity</th>
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
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted py-4">
                  No audit events yet.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.createdAt).toLocaleString()}</td>
                <td>{log.user ? `${log.user.name}` : "System"}</td>
                <td>{log.module}</td>
                <td>{log.action}</td>
                <td>
                  {log.entityType} {log.entityId ? `#${log.entityId.slice(0, 8)}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
