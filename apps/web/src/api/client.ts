import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

// Locally, Vite's dev-server proxy forwards the relative "/api" path to the backend (see
// vite.config.ts), so nothing needs to be set. In production the frontend and backend are
// typically separate deployments (different origins), so VITE_API_URL points this at the
// backend's own URL instead.
const API_BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : "/api";

export const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const res = await axios.post<{ accessToken: string }>(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true });
  accessToken = res.data.accessToken;
  return accessToken;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthRoute = original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");

    if (error.response?.status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;
      try {
        refreshPromise ??= refreshAccessToken();
        const newToken = await refreshPromise;
        refreshPromise = null;
        original.headers.set("Authorization", `Bearer ${newToken}`);
        return api.request(original);
      } catch {
        refreshPromise = null;
        onUnauthorized?.();
      }
    }
    return Promise.reject(error);
  }
);
