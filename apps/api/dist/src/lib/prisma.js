"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const basePrisma = global.__prisma ??
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
        // Prisma's default interactive-transaction timeout (5s) is comfortable against a local
        // Postgres instance but too tight once the database is remote (e.g. Neon over the public
        // internet) — a multi-step transaction (recording a purchase, a multi-batch FEFO sale,
        // etc.) does several sequential round trips that can exceed 5s purely on network latency,
        // aborting an otherwise-correct transaction. Give real workloads headroom.
        transactionOptions: { timeout: 30_000, maxWait: 10_000 },
    });
if (process.env.NODE_ENV !== "production") {
    global.__prisma = basePrisma;
}
const RETRYABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;
function isRetryableConnectionError(err) {
    if (err instanceof client_1.Prisma.PrismaClientInitializationError)
        return true;
    if (err instanceof client_1.Prisma.PrismaClientKnownRequestError && RETRYABLE_CODES.has(err.code))
        return true;
    return false;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// A connection-establishment failure (host unreachable, server closed the connection, pool
// couldn't get a client in time) means the query never reached the database — it's always safe
// to retry, unlike a failure mid-execution where a write might have already landed. A remote,
// shared-hosting database (Hostinger, in production) can have brief network blips that a local
// Postgres instance never exposed; without this, every such blip surfaced as a raw 500 to
// whoever happened to be mid-request at that moment instead of quietly recovering.
exports.prisma = basePrisma.$extends({
    query: {
        $allOperations: async ({ query, args }) => {
            let attempt = 0;
            for (;;) {
                try {
                    return await query(args);
                }
                catch (err) {
                    attempt += 1;
                    if (attempt > MAX_RETRIES || !isRetryableConnectionError(err))
                        throw err;
                    await sleep(RETRY_DELAY_MS * attempt);
                }
            }
        },
    },
});
