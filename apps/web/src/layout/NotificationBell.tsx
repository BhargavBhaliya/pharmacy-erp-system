import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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

export function NotificationBell() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canView = hasPermission("notifications", "view");

  async function load() {
    if (!canView) return;
    const res = await api.get<{ data: NotificationItem[]; unreadCount: number }>("/notifications", { params: { pageSize: 10 } });
    setItems(res.data.data);
    setUnreadCount(res.data.unreadCount);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!canView) return null;

  async function markRead(id: string) {
    await api.put(`/notifications/${id}/read`);
    await load();
  }

  async function markAllRead() {
    await api.put("/notifications/read-all");
    await load();
  }

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
              <button className="btn btn-sm btn-link p-0" onClick={markAllRead}>
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
                    <button className="btn btn-sm btn-link p-0" onClick={() => markRead(n.id)}>
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
