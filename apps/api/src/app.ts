import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { prisma } from "./lib/prisma";
import { UPLOAD_ROOT } from "./lib/upload";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { branchesRouter } from "./modules/branches/branches.routes";
import { usersRouter } from "./modules/users/users.routes";
import { rolesRouter } from "./modules/roles/roles.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { manufacturersRouter, productCategoriesRouter, unitsRouter } from "./modules/catalog/catalog.routes";
import { suppliersRouter } from "./modules/suppliers/suppliers.routes";
import { productsRouter } from "./modules/products/products.routes";
import { batchesRouter } from "./modules/inventory/batches.routes";
import { inventoryRouter } from "./modules/inventory/inventory.routes";
import { stockTransferRouter } from "./modules/stock-transfer/stock-transfer.routes";
import { purchaseOrdersRouter } from "./modules/purchase/purchase-orders.routes";
import { purchasesRouter } from "./modules/purchase/purchases.routes";
import { purchaseReturnsRouter } from "./modules/purchase/purchase-returns.routes";
import { doctorsRouter } from "./modules/doctors/doctors.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import { prescriptionsRouter } from "./modules/prescriptions/prescriptions.routes";
import { salesRouter } from "./modules/sales/sales.routes";
import { salesReturnRouter } from "./modules/sales-return/sales-return.routes";
import { expenseCategoriesRouter, expensesRouter } from "./modules/expenses/expenses.routes";
import { receiptsRouter } from "./modules/receipts/receipts.routes";
import { supplierPaymentsRouter } from "./modules/supplier-payments/supplier-payments.routes";
import { cashSessionsRouter } from "./modules/cash-sessions/cash-sessions.routes";
import { countersRouter } from "./modules/counters/counters.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { platformRouter } from "./modules/platform/platform.routes";
import { platformExchangeRouter } from "./modules/platform/platform-exchange.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ level: env.NODE_ENV === "test" ? "silent" : "info" }));

// Uploaded logo/signature images, served directly (no auth — filenames are random, not
// guessable, and these are just branding assets meant to render in an <img> tag on an invoice,
// which can't send an Authorization header anyway). Helmet's default Cross-Origin-Resource-Policy
// would otherwise block the frontend (a different origin in dev) from loading these images, so
// it's relaxed only for this one path, not the whole app.
app.use(
  "/uploads",
  (_req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(UPLOAD_ROOT)
);

// Baseline API-wide limiter; auth routes layer a stricter one on top (see auth.routes.ts).
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

// Actually pings the database rather than just confirming the process is alive — a load
// balancer or uptime monitor watching this can tell "API is up but DB is unreachable" apart
// from a real outage, instead of reporting healthy while every real request 503s.
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "up" });
  } catch {
    res.status(503).json({ status: "degraded", database: "down" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/auth", platformExchangeRouter);
app.use("/api/branches", branchesRouter);
app.use("/api/users", usersRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/manufacturers", manufacturersRouter);
app.use("/api/product-categories", productCategoriesRouter);
app.use("/api/units", unitsRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/products", productsRouter);
app.use("/api/batches", batchesRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/stock-transfers", stockTransferRouter);
app.use("/api/purchase-orders", purchaseOrdersRouter);
app.use("/api/purchases", purchasesRouter);
app.use("/api/purchase-returns", purchaseReturnsRouter);
app.use("/api/doctors", doctorsRouter);
app.use("/api/customers", customersRouter);
app.use("/api/prescriptions", prescriptionsRouter);
app.use("/api/sales", salesRouter);
app.use("/api/sales-returns", salesReturnRouter);
app.use("/api/expense-categories", expenseCategoriesRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/receipts", receiptsRouter);
app.use("/api/supplier-payments", supplierPaymentsRouter);
app.use("/api/cash-sessions", cashSessionsRouter);
app.use("/api/counters", countersRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/platform", platformRouter);

app.use(notFoundHandler);
app.use(errorHandler);
