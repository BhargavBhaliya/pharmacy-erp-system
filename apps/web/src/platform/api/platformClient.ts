import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

// Mirrors apps/web/src/api/client.ts exactly, but fully independent: its own in-memory token,
// its own axios instance, its own refresh-dedup logic. Never shares state with the tenant
// client — the platform admin and any tenant session can coexist in the same browser
// (different cookie names/paths) without interfering with each other.
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setPlatformAccessToken(token: string | null): void {
  accessToken = token;
}

export function setPlatformUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

// See apps/web/src/api/client.ts's comment — same VITE_API_URL override for production.
const API_BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/platform` : "/api/platform";

export const platformApi = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

platformApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshPlatformAccessToken(): Promise<string> {
  const res = await axios.post<{ accessToken: string }>(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true });
  accessToken = res.data.accessToken;
  return accessToken;
}

platformApi.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthRoute = original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");

    if (error.response?.status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;
      try {
        refreshPromise ??= refreshPlatformAccessToken();
        const newToken = await refreshPromise;
        refreshPromise = null;
        original.headers.set("Authorization", `Bearer ${newToken}`);
        return platformApi.request(original);
      } catch {
        refreshPromise = null;
        onUnauthorized?.();
      }
    }
    return Promise.reject(error);
  }
);
