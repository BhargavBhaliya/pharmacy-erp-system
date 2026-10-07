import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface BusinessProfile {
  businessName: string;
  legalName?: string | null;
  gstin?: string | null;
  pan?: string | null;
  drugLicenseNumber?: string | null;
  fssaiLicenseNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  invoiceFooter?: string | null;
  termsAndConditions?: string | null;
  financialYearStartMonth: number;
  logoUrl?: string | null;
  signatureUrl?: string | null;
}

export function SettingsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [expiryWarningDays, setExpiryWarningDays] = useState(90);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = hasPermission("settings", "edit");

  const { data: profileData } = useQuery({
    queryKey: ["settings", "business"],
    queryFn: async () => (await api.get<{ data: BusinessProfile }>("/settings/business")).data.data,
  });

  const { data: expiryWarningDaysData } = useQuery({
    queryKey: ["settings", "expiryWarningDays"],
    queryFn: async () => (await api.get<{ data: number | null }>("/settings/expiryWarningDays")).data.data,
  });

  // profile/expiryWarningDays are edited locally as form state, seeded from the query results
  // (and re-seeded whenever the server copy changes, e.g. after a save invalidates the cache).
  useEffect(() => {
    if (profileData) setProfile(profileData);
  }, [profileData]);

  useEffect(() => {
    if (expiryWarningDaysData !== undefined && expiryWarningDaysData !== null) setExpiryWarningDays(expiryWarningDaysData);
  }, [expiryWarningDaysData]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { profile: BusinessProfile; expiryWarningDays: number }) => {
      await api.put("/settings/business", payload.profile);
      await api.put("/settings/expiryWarningDays", { value: payload.expiryWarningDays });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setSaved(true);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to save settings");
    },
  });

  function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaved(false);
    saveMutation.mutate({ profile, expiryWarningDays });
  }

  const uploadMutation = useMutation({
    mutationFn: async ({ field, file }: { field: "logo" | "signature"; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<{ data: { url: string } }>(`/settings/upload-${field}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.data.url;
    },
    onSuccess: (url, { field }) => {
      setProfile((p) => (p ? { ...p, [field === "logo" ? "logoUrl" : "signatureUrl"]: url } : p));
      queryClient.invalidateQueries({ queryKey: ["settings", "business"] });
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to upload image");
    },
  });

  function handleFileSelect(field: "logo" | "signature", e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file name later
    if (file) uploadMutation.mutate({ field, file });
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
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save settings"}
          </button>
        </fieldset>
      </form>

      {canEdit && (
        <div className="card card-body mb-4">
          <h6>Branding</h6>
          <p className="text-muted small">Shown on printed invoices. JPEG, PNG, or WebP, up to 2MB.</p>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Logo</label>
              {profile.logoUrl && (
                <div className="mb-2">
                  <img src={profile.logoUrl} alt="Logo" style={{ height: 60, objectFit: "contain" }} className="border rounded p-1" />
                </div>
              )}
              <input
                type="file"
                className="form-control form-control-sm"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadMutation.isPending}
                onChange={(e) => handleFileSelect("logo", e)}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Signature</label>
              {profile.signatureUrl && (
                <div className="mb-2">
                  <img src={profile.signatureUrl} alt="Signature" style={{ height: 60, objectFit: "contain" }} className="border rounded p-1" />
                </div>
              )}
              <input
                type="file"
                className="form-control form-control-sm"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadMutation.isPending}
                onChange={(e) => handleFileSelect("signature", e)}
              />
            </div>
          </div>
        </div>
      )}

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
