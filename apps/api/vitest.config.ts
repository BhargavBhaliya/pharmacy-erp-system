import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // 30s was fine against a local Postgres instance, but a test that does several sequential
    // HTTP+DB round trips (e.g. two tenants' worth of setup) can now exceed it purely on network
    // latency to a remote database (Hostinger MySQL, or Neon before it) — not a logic failure.
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});
