import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string | null;
}

const REFRESH_INTERVAL_MS = 30_000;

export function NotificationBell() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canView = hasPermission("notifications", "view");

  const { data } = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: async () => (await api.get<{ data: NotificationItem[]; unreadCount: number }>("/notifications", { params: { pageSize: 10 } })).data,
    enabled: canView,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const items = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.put("/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!canView) return null;

  return (
    <div className="position-relative" ref={ref}>
      <button className="btn btn-outline-secondary position-relative" onClick={() => setOpen((o) => !o)}>
        Notifications
        {unreadCount > 0 && (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">{unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="card shadow position-absolute end-0 mt-1" style={{ width: 340, zIndex: 20 }}>
          <div className="card-header d-flex justify-content-between align-items-center py-2">
            <strong className="small">Notifications</strong>
            {unreadCount > 0 && (
              <button className="btn btn-sm btn-link p-0" onClick={() => markAllReadMutation.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          <div className="list-group list-group-flush" style={{ maxHeight: 360, overflowY: "auto" }}>
            {items.length === 0 && <div className="p-3 text-muted small">No notifications yet.</div>}
            {items.map((n) => (
              <div key={n.id} className={`list-group-item small ${n.isRead ? "" : "bg-light"}`}>
                <div className="d-flex justify-content-between">
                  <strong>{n.title}</strong>
                  {!n.isRead && (
                    <button className="btn btn-sm btn-link p-0" onClick={() => markReadMutation.mutate(n.id)}>
                      Mark read
                    </button>
                  )}
                </div>
                <div className="text-muted">{n.message}</div>
                {n.link && (
                  <Link to={n.link} className="small" onClick={() => setOpen(false)}>
                    View
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
