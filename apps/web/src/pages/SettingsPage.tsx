import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface BusinessProfile {
  businessName: string;
  legalName?: string | null;
  gstin?: string | null;
  pan?: string | null;
  drugLicenseNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  invoiceFooter?: string | null;
  termsAndConditions?: string | null;
  financialYearStartMonth: number;
}

export function SettingsPage() {
  const { hasPermission } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [expiryWarningDays, setExpiryWarningDays] = useState(90);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = hasPermission("settings", "edit");

  useEffect(() => {
    api.get<{ data: BusinessProfile }>("/settings/business").then((res) => setProfile(res.data.data));
    api.get<{ data: number | null }>("/settings/expiryWarningDays").then((res) => {
      if (res.data.data !== null) setExpiryWarningDays(res.data.data);
    });
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setSaved(false);
    try {
      await api.put("/settings/business", profile);
      await api.put("/settings/expiryWarningDays", { value: expiryWarningDays });
      setSaved(true);
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to save settings");
    }
  }

  async function handleExport() {
    const res = await api.get("/settings/export/data", { responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pharmacy-erp-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!profile) return <div className="text-muted">Loading...</div>;

  return (
    <div>
      <h3 className="mb-4">Settings</h3>

      <form className="card card-body mb-4" onSubmit={handleSave}>
        <h6>Business Profile</h6>
        {error && <div className="alert alert-danger py-2">{error}</div>}
        {saved && <div className="alert alert-success py-2">Saved.</div>}
        <fieldset disabled={!canEdit}>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Business name</label>
              <input className="form-control" value={profile.businessName} onChange={(e) => setProfile({ ...profile, businessName: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Legal name</label>
              <input className="form-control" value={profile.legalName ?? ""} onChange={(e) => setProfile({ ...profile, legalName: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">GSTIN</label>
              <input className="form-control" value={profile.gstin ?? ""} onChange={(e) => setProfile({ ...profile, gstin: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">PAN</label>
              <input className="form-control" value={profile.pan ?? ""} onChange={(e) => setProfile({ ...profile, pan: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Drug license number</label>
              <input className="form-control" value={profile.drugLicenseNumber ?? ""} onChange={(e) => setProfile({ ...profile, drugLicenseNumber: e.target.value })} />
            </div>
            <div className="col-md-6">
              <label className="form-label">Address</label>
              <input className="form-control" value={profile.address ?? ""} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">City</label>
              <input className="form-control" value={profile.city ?? ""} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
            </div>
            <div className="col-md-3">
              <label className="form-label">State</label>
              <input className="form-control" value={profile.state ?? ""} onChange={(e) => setProfile({ ...profile, state: e.target.value })} />
            </div>
            <div className="col-md-8">
              <label className="form-label">Invoice footer</label>
              <input className="form-control" value={profile.invoiceFooter ?? ""} onChange={(e) => setProfile({ ...profile, invoiceFooter: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Financial year starts (month)</label>
              <select className="form-select" value={profile.financialYearStartMonth} onChange={(e) => setProfile({ ...profile, financialYearStartMonth: Number(e.target.value) })}>
                {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Expiry warning window (days)</label>
              <input type="number" className="form-control" value={expiryWarningDays} onChange={(e) => setExpiryWarningDays(Number(e.target.value))} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }}>
            Save settings
          </button>
        </fieldset>
      </form>

      {canEdit && (
        <div className="card card-body">
          <h6>Backup</h6>
          <p className="text-muted small">
            Downloads a JSON file of everything belonging to your business (products, batches, sales, purchases,
            customers, suppliers, etc). There is currently no restore-from-backup feature — see the README.
          </p>
          <button className="btn btn-outline-secondary" style={{ width: 220 }} onClick={handleExport}>
            Download backup (JSON)
          </button>
        </div>
      )}
    </div>
  );
}
