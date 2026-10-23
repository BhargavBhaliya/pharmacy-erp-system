import { useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation } from "@tanstack/react-query";
import { platformApi } from "../api/platformClient";
import { usePlatformAuth } from "../auth/PlatformAuthContext";

export function PlatformSettingsPage() {
  const { admin, refreshProfile } = usePlatformAuth();
  const [profileForm, setProfileForm] = useState({ name: admin?.name ?? "", email: admin?.email ?? "", username: admin?.username ?? "" });
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  const saveProfileMutation = useMutation({
    mutationFn: (payload: typeof profileForm) => platformApi.put("/auth/me", payload),
    onSuccess: async () => {
      await refreshProfile();
      setProfileMessage("Saved.");
    },
    onError: (err) => {
      setProfileError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to save profile");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) => platformApi.post("/auth/change-password", payload),
    onSuccess: () => {
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPwMessage("Password changed. Any other signed-in sessions have been logged out.");
    },
    onError: (err) => {
      setPwError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to change password");
    },
  });

  function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileMessage(null);
    saveProfileMutation.mutate(profileForm);
  }

  function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwMessage(null);
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError("New password and confirmation don't match");
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: pwForm.currentPassword,
      newPassword: pwForm.newPassword,
    });
  }

  return (
    <div>
      <h3 className="mb-4">Settings</h3>

      <div className="row g-3">
        <div className="col-lg-6">
          <form className="card card-body" onSubmit={handleSaveProfile}>
            <h6 className="mb-3">Admin profile</h6>
            {profileError && <div className="alert alert-danger py-2">{profileError}</div>}
            {profileMessage && <div className="alert alert-success py-2">{profileMessage}</div>}

            <label className="form-label">Name</label>
            <input
              className="form-control mb-3"
              required
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
            />

            <label className="form-label">Email (login id)</label>
            <input
              type="email"
              className="form-control mb-3"
              required
              value={profileForm.email}
              onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
            />

            <label className="form-label">Username (also a login id)</label>
            <input
              className="form-control mb-3"
              required
              pattern="[a-z0-9_]+"
              title="Lowercase letters, numbers, and underscores only"
              value={profileForm.username}
              onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
            />

            <button type="submit" className="btn btn-dark" disabled={saveProfileMutation.isPending} style={{ width: 140 }}>
              {saveProfileMutation.isPending ? "Saving..." : "Save"}
            </button>
          </form>
        </div>

        <div className="col-lg-6">
          <form className="card card-body" onSubmit={handleChangePassword}>
            <h6 className="mb-3">Change password</h6>
            {pwError && <div className="alert alert-danger py-2">{pwError}</div>}
            {pwMessage && <div className="alert alert-success py-2">{pwMessage}</div>}

            <label className="form-label">Current password</label>
            <input
              type="password"
              className="form-control mb-3"
              required
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
            />

            <label className="form-label">New password</label>
            <input
              type="password"
              className="form-control mb-3"
              required
              minLength={8}
              value={pwForm.newPassword}
              onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
            />

            <label className="form-label">Confirm new password</label>
            <input
              type="password"
              className="form-control mb-3"
              required
              minLength={8}
              value={pwForm.confirmPassword}
              onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
            />

            <button type="submit" className="btn btn-dark" disabled={changePasswordMutation.isPending} style={{ width: 180 }}>
              {changePasswordMutation.isPending ? "Changing..." : "Change password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
