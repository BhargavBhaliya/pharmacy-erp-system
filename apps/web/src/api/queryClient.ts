import { QueryClient } from "@tanstack/react-query";

// Shared cache for the whole app (tenant + platform). Defaults chosen for a dashboard-style
// business app: data is cached and reused across page visits (no spinner on data you already
// have), but revalidates on window focus / reconnect so it never goes stale for long — the
// "real-time" feel the UI aims for without actually needing websockets.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
