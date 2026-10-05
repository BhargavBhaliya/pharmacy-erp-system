import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { platformApi, setPlatformAccessToken, setPlatformUnauthorizedHandler } from "../api/platformClient";

interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
}

interface PlatformAuthContextValue {
  admin: PlatformAdmin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const PlatformAuthContext = createContext<PlatformAuthContextValue | undefined>(undefined);

// Mirrors apps/web/src/auth/AuthContext.tsx's shape, scoped to its own /platform/* subtree —
// never wraps the whole app, so it does no work for routes it doesn't own.
export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile() {
    const res = await platformApi.get<PlatformAdmin>("/auth/me");
    setAdmin(res.data);
  }

  useEffect(() => {
    setPlatformUnauthorizedHandler(() => {
      setPlatformAccessToken(null);
      setAdmin(null);
    });

    (async () => {
      try {
        const refreshRes = await platformApi.post<{ accessToken: string }>("/auth/refresh");
        setPlatformAccessToken(refreshRes.data.accessToken);
        await loadProfile();
      } catch {
        // No valid session yet; admin needs to log in.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const res = await platformApi.post<{ accessToken: string }>("/auth/login", { email, password });
    setPlatformAccessToken(res.data.accessToken);
    await loadProfile();
  }

  async function logout() {
    await platformApi.post("/auth/logout").catch(() => undefined);
    setPlatformAccessToken(null);
    setAdmin(null);
  }

  const value = useMemo(() => ({ admin, loading, login, logout }), [admin, loading]);

  return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>;
}

export function usePlatformAuth(): PlatformAuthContextValue {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) throw new Error("usePlatformAuth must be used within PlatformAuthProvider");
  return ctx;
}
