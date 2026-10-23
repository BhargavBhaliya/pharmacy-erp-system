import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setAccessToken, setUnauthorizedHandler } from "../api/client";

interface Me {
  id: string;
  name: string;
  email: string;
  username: string;
  tenantId: string;
  roleId: string;
  branchIds: string[];
  permissions: string[];
}

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (module: string, action: string) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile() {
    const res = await api.get<Me>("/auth/me");
    setUser(res.data);
  }

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAccessToken(null);
      setUser(null);
    });

    (async () => {
      try {
        const refreshRes = await api.post<{ accessToken: string }>("/auth/refresh");
        setAccessToken(refreshRes.data.accessToken);
        await loadProfile();
      } catch {
        // No valid session yet; user needs to log in.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<{ accessToken: string }>("/auth/login", { email, password });
    setAccessToken(res.data.accessToken);
    await loadProfile();
  }

  async function logout() {
    await api.post("/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }

  function hasPermission(module: string, action: string): boolean {
    return user?.permissions.includes(`${module}.${action}`) ?? false;
  }

  const value = useMemo(
    () => ({ user, loading, login, logout, hasPermission, refreshProfile: loadProfile }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
