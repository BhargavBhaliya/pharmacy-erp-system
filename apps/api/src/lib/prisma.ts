import { PrismaClient } from "@prisma/client";

// Reused across hot-reloads in dev so we don't exhaust DB connections.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Prisma's default interactive-transaction timeout (5s) is comfortable against a local
    // Postgres instance but too tight once the database is remote (e.g. Neon over the public
    // internet) — a multi-step transaction (recording a purchase, a multi-batch FEFO sale,
    // etc.) does several sequential round trips that can exceed 5s purely on network latency,
    // aborting an otherwise-correct transaction. Give real workloads headroom.
    transactionOptions: { timeout: 30_000, maxWait: 10_000 },
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
