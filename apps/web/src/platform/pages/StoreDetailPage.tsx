import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { platformApi } from "../api/platformClient";

interface StoreDetail {
  id: string;
  storeCode: string;
  businessName: string;
  legalName: string | null;
  ownerName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  gstin: string | null;
  pan: string | null;
  drugLicenseNumber: string | null;
  fssaiLicenseNumber: string | null;
  address: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
  pincode: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { users: number; branches: number };
}

interface StoreUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  role: { id: string; name: string };
}

interface AuditLogRow {
  id: string;
  action: string;
  module: string;
  entityType: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
  newValue: unknown;
}

interface Subscription {
  planName: string;
  billingCycle: "MONTHLY" | "QUARTERLY" | "YEARLY";
  amount: string;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELLED";
  nextDueDate: string | null;
  notes: string | null;
}

interface Payment {
  id: string;
  amount: string;
  paymentMode: string;
  paymentDate: string;
  referenceNumber: string | null;
}

const SUBSCRIPTION_STATUS_BADGE: Record<string, string> = {
  TRIAL: "text-bg-info",
  ACTIVE: "text-bg-success",
  PAST_DUE: "text-bg-warning",
  EXPIRED: "text-bg-danger",
  CANCELLED: "text-bg-secondary",
};

const DETAIL_FIELDS: { key: keyof StoreDetail; label: string }[] = [
  { key: "businessName", label: "Business name" },
  { key: "legalName", label: "Legal name" },
  { key: "ownerName", label: "Owner name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
  { key: "gstin", label: "GSTIN" },
  { key: "pan", label: "PAN" },
  { key: "drugLicenseNumber", label: "Drug license #" },
  { key: "fssaiLicenseNumber", label: "FSSAI license #" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "district", label: "District" },
  { key: "state", label: "State" },
  { key: "pincode", label: "Pincode" },
];

export function StoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [activity, setActivity] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [lastGeneratedPassword, setLastGeneratedPassword] = useState<{ userEmail: string; password: string } | null>(null);
  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(null);

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subForm, setSubForm] = useState({ planName: "Standard", billingCycle: "MONTHLY", amount: "0", status: "TRIAL", nextDueDate: "", notes: "" });
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentForm, setPaymentForm] = useState({ amount: "", paymentMode: "CASH", referenceNumber: "", notes: "", extendDueDate: true });
  const [recordingPayment, setRecordingPayment] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    const [storeRes, usersRes, activityRes, subRes, paymentsRes] = await Promise.all([
      platformApi.get<{ data: StoreDetail }>(`/stores/${id}`),
      platformApi.get<{ data: StoreUser[] }>(`/stores/${id}/users`),
      platformApi.get<{ data: { recentAuditLogs: AuditLogRow[] } }>(`/stores/${id}/activity`),
      platformApi.get<{ data: Subscription | null }>(`/stores/${id}/subscription`),
      platformApi.get<{ data: Payment[] }>(`/stores/${id}/payments`),
    ]);
    setStore(storeRes.data.data);
    setForm(
      Object.fromEntries(DETAIL_FIELDS.map(({ key }) => [key, (storeRes.data.data[key] as string | null) ?? ""]))
    );
    setUsers(usersRes.data.data);
    setActivity(activityRes.data.data.recentAuditLogs);
    setSubscription(subRes.data.data);
    if (subRes.data.data) {
      const s = subRes.data.data;
      setSubForm({
        planName: s.planName,
        billingCycle: s.billingCycle,
        amount: s.amount,
        status: s.status,
        nextDueDate: s.nextDueDate ? s.nextDueDate.slice(0, 10) : "",
        notes: s.notes ?? "",
      });
    }
    setPayments(paymentsRes.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSaveDetails() {
    if (!id) return;
    setError(null);
    setSavingDetails(true);
    try {
      await platformApi.put(`/stores/${id}`, form);
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to save store details");
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleToggleActive() {
    if (!id || !store) return;
    if (store.isActive && !window.confirm("Deactivate this store? Every user there will be locked out immediately.")) return;
    setError(null);
    setTogglingActive(true);
    try {
      await platformApi.post(`/stores/${id}/${store.isActive ? "deactivate" : "activate"}`);
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to update store status");
    } finally {
      setTogglingActive(false);
    }
  }

  async function handleResetPassword(user: StoreUser) {
    if (!id) return;
    setError(null);
    setResettingUserId(user.id);
    try {
      const res = await platformApi.post<{ data: { generatedPassword?: string } }>(`/stores/${id}/users/${user.id}/reset-password`, {});
      if (res.data.data.generatedPassword) {
        setLastGeneratedPassword({ userEmail: user.email, password: res.data.data.generatedPassword });
      }
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to reset password");
    } finally {
      setResettingUserId(null);
    }
  }

  async function handleImpersonate(user: StoreUser) {
    if (!id) return;
    setError(null);
    setImpersonatingUserId(user.id);
    try {
      const res = await platformApi.post<{ data: { exchangeCode: string } }>(`/stores/${id}/users/${user.id}/impersonate`);
      window.open(`/impersonate-landing?code=${encodeURIComponent(res.data.data.exchangeCode)}`, "_blank");
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to access store");
    } finally {
      setImpersonatingUserId(null);
    }
  }

  async function handleSaveSubscription() {
    if (!id) return;
    setError(null);
    setSavingSubscription(true);
    try {
      await platformApi.put(`/stores/${id}/subscription`, {
        planName: subForm.planName,
        billingCycle: subForm.billingCycle,
        amount: Number(subForm.amount),
        status: subForm.status,
        nextDueDate: subForm.nextDueDate || undefined,
        notes: subForm.notes || undefined,
      });
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to save subscription");
    } finally {
      setSavingSubscription(false);
    }
  }

  async function handleRecordPayment() {
    if (!id) return;
    setError(null);
    setRecordingPayment(true);
    try {
      await platformApi.post(`/stores/${id}/payments`, {
        amount: Number(paymentForm.amount),
        paymentMode: paymentForm.paymentMode,
        referenceNumber: paymentForm.referenceNumber || undefined,
        notes: paymentForm.notes || undefined,
        extendDueDate: paymentForm.extendDueDate,
      });
      setPaymentForm({ amount: "", paymentMode: "CASH", referenceNumber: "", notes: "", extendDueDate: true });
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to record payment");
    } finally {
      setRecordingPayment(false);
    }
  }

  if (loading || !store) return <div className="text-muted">Loading...</div>;

  return (
    <div>
      <Link to="/platform/stores" className="d-inline-block mb-3 small text-decoration-none">
        ← Back to stores
      </Link>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="mb-0">
            {store.businessName} <span className="text-muted fs-6">({store.storeCode})</span>
          </h3>
          <span className={`badge ${store.isActive ? "text-bg-success" : "text-bg-secondary"}`}>
            {store.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <button className={`btn ${store.isActive ? "btn-outline-danger" : "btn-outline-success"}`} disabled={togglingActive} onClick={handleToggleActive}>
          {togglingActive ? "Working..." : store.isActive ? "Deactivate store" : "Activate store"}
        </button>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {lastGeneratedPassword && (
        <div className="alert alert-success d-flex justify-content-between align-items-center">
          <span>
            New password for <strong>{lastGeneratedPassword.userEmail}</strong>: <code>{lastGeneratedPassword.password}</code> — share it securely, it won't be shown again.
          </span>
          <button className="btn-close" onClick={() => setLastGeneratedPassword(null)}></button>
        </div>
      )}

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="card card-body mb-3">
            <h6 className="mb-3">Store details</h6>
            <div className="row g-2">
              {DETAIL_FIELDS.map(({ key, label }) => (
                <div className="col-md-6" key={key}>
                  <label className="form-label small">{label}</label>
                  <input
                    className="form-control form-control-sm"
                    value={form[key] ?? ""}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <button className="btn btn-dark mt-3" style={{ width: 160 }} disabled={savingDetails} onClick={handleSaveDetails}>
              {savingDetails ? "Saving..." : "Save details"}
            </button>
          </div>

          <div className="card card-body">
            <h6 className="mb-3">Users ({users.length})</h6>
            <table className="table table-sm mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role.name}</td>
                    <td>
                      <span className={`badge ${u.isActive ? "text-bg-success" : "text-bg-secondary"}`}>{u.isActive ? "Active" : "Inactive"}</span>
                    </td>
                    <td className="text-end">
                      <div className="btn-group">
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          disabled={resettingUserId === u.id}
                          onClick={() => handleResetPassword(u)}
                        >
                          {resettingUserId === u.id ? "..." : "Reset password"}
                        </button>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          disabled={impersonatingUserId === u.id || !store.isActive}
                          onClick={() => handleImpersonate(u)}
                          title={!store.isActive ? "Activate the store first" : "Opens the normal store app in a new tab, logged in as this user"}
                        >
                          {impersonatingUserId === u.id ? "..." : "Access this store"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-lg-5">
          <div className="card card-body mb-3">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="mb-0">Subscription & Billing</h6>
              {subscription && (
                <span className={`badge ${SUBSCRIPTION_STATUS_BADGE[subscription.status] ?? "text-bg-light border"}`}>
                  {subscription.status.replace("_", " ")}
                </span>
              )}
            </div>
            <div className="row g-2 mb-2">
              <div className="col-6">
                <label className="form-label small">Plan name</label>
                <input className="form-control form-control-sm" value={subForm.planName} onChange={(e) => setSubForm({ ...subForm, planName: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label small">Billing cycle</label>
                <select className="form-select form-select-sm" value={subForm.billingCycle} onChange={(e) => setSubForm({ ...subForm, billingCycle: e.target.value })}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label small">Amount (₹)</label>
                <input type="number" className="form-control form-control-sm" value={subForm.amount} onChange={(e) => setSubForm({ ...subForm, amount: e.target.value })} />
              </div>
              <div className="col-6">
                <label className="form-label small">Status</label>
                <select className="form-select form-select-sm" value={subForm.status} onChange={(e) => setSubForm({ ...subForm, status: e.target.value })}>
                  <option value="TRIAL">Trial</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAST_DUE">Past due</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              <div className="col-12">
                <label className="form-label small">Next due date</label>
                <input type="date" className="form-control form-control-sm" value={subForm.nextDueDate} onChange={(e) => setSubForm({ ...subForm, nextDueDate: e.target.value })} />
              </div>
              <div className="col-12">
                <label className="form-label small">Notes</label>
                <input className="form-control form-control-sm" value={subForm.notes} onChange={(e) => setSubForm({ ...subForm, notes: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-sm btn-dark" disabled={savingSubscription} onClick={handleSaveSubscription}>
              {savingSubscription ? "Saving..." : subscription ? "Save plan" : "Set up plan"}
            </button>

            <hr />

            <h6 className="mb-2">Record a payment</h6>
            <div className="row g-2 mb-2">
              <div className="col-6">
                <input
                  type="number"
                  className="form-control form-control-sm"
                  placeholder="Amount"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                />
              </div>
              <div className="col-6">
                <select
                  className="form-select form-select-sm"
                  value={paymentForm.paymentMode}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}
                >
                  {["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12">
                <input
                  className="form-control form-control-sm"
                  placeholder="Reference # (optional)"
                  value={paymentForm.referenceNumber}
                  onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })}
                />
              </div>
              <div className="col-12 form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="extendDueDate"
                  checked={paymentForm.extendDueDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, extendDueDate: e.target.checked })}
                />
                <label className="form-check-label small" htmlFor="extendDueDate">
                  Push next due date forward by one billing cycle
                </label>
              </div>
            </div>
            <button className="btn btn-sm btn-success" disabled={recordingPayment || !paymentForm.amount} onClick={handleRecordPayment}>
              {recordingPayment ? "Recording..." : "Record payment"}
            </button>

            {payments.length > 0 && (
              <>
                <hr />
                <h6 className="mb-2">Payment history</h6>
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  {payments.map((p) => (
                    <div key={p.id} className="d-flex justify-content-between small border-bottom pb-1 mb-1">
                      <span>
                        ₹{p.amount} · {p.paymentMode}
                        {p.referenceNumber ? ` · ${p.referenceNumber}` : ""}
                      </span>
                      <span className="text-muted">{new Date(p.paymentDate).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="card card-body">
            <h6 className="mb-3">Recent activity</h6>
            {activity.length === 0 && <div className="text-muted small">No activity yet.</div>}
            <div style={{ maxHeight: 500, overflowY: "auto" }}>
              {activity.map((a) => (
                <div key={a.id} className="border-bottom pb-2 mb-2 small">
                  <div className="d-flex justify-content-between">
                    <span className="fw-semibold">{a.action}</span>
                    <span className="text-muted">{new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="text-muted">
                    {a.module === "platform_admin" ? "By Platform Admin" : a.user ? `By ${a.user.name}` : "System"}
                    {a.entityType ? ` · ${a.entityType}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
