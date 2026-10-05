import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { api, setAccessToken } from "../api/client";
import { useAuth } from "../auth/AuthContext";

// Public landing page for the Platform Admin's "Access this store" hand-off. Exchanges a
// one-time code (minted by POST /platform/stores/:id/users/:id/impersonate) for a normal
// tenant session, using the existing, unmodified tenant api client/AuthContext — nothing
// downstream needs to know impersonation exists.
export function ImpersonationLandingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("Missing access code.");
      return;
    }
    (async () => {
      try {
        const res = await api.post<{ accessToken: string }>("/auth/exchange-impersonation-code", { code });
        setAccessToken(res.data.accessToken);
        await refreshProfile();
        navigate("/", { replace: true });
      } catch (err) {
        setError(isAxiosError(err) ? err.response?.data?.error?.message : "This access link has expired or was already used.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="d-flex vh-100 align-items-center justify-content-center bg-light">
      {error ? (
        <div className="alert alert-danger" style={{ maxWidth: 420 }}>
          {error}
        </div>
      ) : (
        <div className="text-center text-muted">
          <div className="spinner-border text-primary mb-3" role="status" />
          <div>Signing you in...</div>
        </div>
      )}
    </div>
  );
}
