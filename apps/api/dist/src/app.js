"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const prisma_1 = require("./lib/prisma");
const upload_1 = require("./lib/upload");
const pino_http_1 = __importDefault(require("pino-http"));
const env_1 = require("./config/env");
const auth_routes_1 = require("./modules/auth/auth.routes");
const branches_routes_1 = require("./modules/branches/branches.routes");
const users_routes_1 = require("./modules/users/users.routes");
const roles_routes_1 = require("./modules/roles/roles.routes");
const audit_routes_1 = require("./modules/audit/audit.routes");
const catalog_routes_1 = require("./modules/catalog/catalog.routes");
const suppliers_routes_1 = require("./modules/suppliers/suppliers.routes");
const products_routes_1 = require("./modules/products/products.routes");
const batches_routes_1 = require("./modules/inventory/batches.routes");
const inventory_routes_1 = require("./modules/inventory/inventory.routes");
const stock_transfer_routes_1 = require("./modules/stock-transfer/stock-transfer.routes");
const purchase_orders_routes_1 = require("./modules/purchase/purchase-orders.routes");
const purchases_routes_1 = require("./modules/purchase/purchases.routes");
const purchase_returns_routes_1 = require("./modules/purchase/purchase-returns.routes");
const doctors_routes_1 = require("./modules/doctors/doctors.routes");
const customers_routes_1 = require("./modules/customers/customers.routes");
const prescriptions_routes_1 = require("./modules/prescriptions/prescriptions.routes");
const sales_routes_1 = require("./modules/sales/sales.routes");
const sales_return_routes_1 = require("./modules/sales-return/sales-return.routes");
const expenses_routes_1 = require("./modules/expenses/expenses.routes");
const receipts_routes_1 = require("./modules/receipts/receipts.routes");
const supplier_payments_routes_1 = require("./modules/supplier-payments/supplier-payments.routes");
const cash_sessions_routes_1 = require("./modules/cash-sessions/cash-sessions.routes");
const counters_routes_1 = require("./modules/counters/counters.routes");
const reports_routes_1 = require("./modules/reports/reports.routes");
const notifications_routes_1 = require("./modules/notifications/notifications.routes");
const settings_routes_1 = require("./modules/settings/settings.routes");
const platform_routes_1 = require("./modules/platform/platform.routes");
const platform_exchange_routes_1 = require("./modules/platform/platform-exchange.routes");
const errorHandler_1 = require("./middleware/errorHandler");
exports.app = (0, express_1.default)();
exports.app.use((0, helmet_1.default)());
exports.app.use((0, cors_1.default)({ origin: env_1.env.CORS_ORIGIN, credentials: true }));
exports.app.use((0, cookie_parser_1.default)());
exports.app.use(express_1.default.json({ limit: "2mb" }));
exports.app.use((0, pino_http_1.default)({ level: env_1.env.NODE_ENV === "test" ? "silent" : "info" }));
// Uploaded logo/signature images, served directly (no auth — filenames are random, not
// guessable, and these are just branding assets meant to render in an <img> tag on an invoice,
// which can't send an Authorization header anyway). Helmet's default Cross-Origin-Resource-Policy
// would otherwise block the frontend (a different origin in dev) from loading these images, so
// it's relaxed only for this one path, not the whole app.
exports.app.use("/uploads", (_req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
}, express_1.default.static(upload_1.UPLOAD_ROOT));
// Baseline API-wide limiter; auth routes layer a stricter one on top (see auth.routes.ts).
exports.app.use("/api", (0, express_rate_limit_1.default)({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
// Actually pings the database rather than just confirming the process is alive — a load
// balancer or uptime monitor watching this can tell "API is up but DB is unreachable" apart
// from a real outage, instead of reporting healthy while every real request 503s.
exports.app.get("/health", async (_req, res) => {
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        res.json({ status: "ok", database: "up" });
    }
    catch {
        res.status(503).json({ status: "degraded", database: "down" });
    }
});
exports.app.use("/api/auth", auth_routes_1.authRouter);
exports.app.use("/api/auth", platform_exchange_routes_1.platformExchangeRouter);
exports.app.use("/api/branches", branches_routes_1.branchesRouter);
exports.app.use("/api/users", users_routes_1.usersRouter);
exports.app.use("/api/roles", roles_routes_1.rolesRouter);
exports.app.use("/api/audit-logs", audit_routes_1.auditRouter);
exports.app.use("/api/manufacturers", catalog_routes_1.manufacturersRouter);
exports.app.use("/api/product-categories", catalog_routes_1.productCategoriesRouter);
exports.app.use("/api/units", catalog_routes_1.unitsRouter);
exports.app.use("/api/suppliers", suppliers_routes_1.suppliersRouter);
exports.app.use("/api/products", products_routes_1.productsRouter);
exports.app.use("/api/batches", batches_routes_1.batchesRouter);
exports.app.use("/api/inventory", inventory_routes_1.inventoryRouter);
exports.app.use("/api/stock-transfers", stock_transfer_routes_1.stockTransferRouter);
exports.app.use("/api/purchase-orders", purchase_orders_routes_1.purchaseOrdersRouter);
exports.app.use("/api/purchases", purchases_routes_1.purchasesRouter);
exports.app.use("/api/purchase-returns", purchase_returns_routes_1.purchaseReturnsRouter);
exports.app.use("/api/doctors", doctors_routes_1.doctorsRouter);
exports.app.use("/api/customers", customers_routes_1.customersRouter);
exports.app.use("/api/prescriptions", prescriptions_routes_1.prescriptionsRouter);
exports.app.use("/api/sales", sales_routes_1.salesRouter);
exports.app.use("/api/sales-returns", sales_return_routes_1.salesReturnRouter);
exports.app.use("/api/expense-categories", expenses_routes_1.expenseCategoriesRouter);
exports.app.use("/api/expenses", expenses_routes_1.expensesRouter);
exports.app.use("/api/receipts", receipts_routes_1.receiptsRouter);
exports.app.use("/api/supplier-payments", supplier_payments_routes_1.supplierPaymentsRouter);
exports.app.use("/api/cash-sessions", cash_sessions_routes_1.cashSessionsRouter);
exports.app.use("/api/counters", counters_routes_1.countersRouter);
exports.app.use("/api/reports", reports_routes_1.reportsRouter);
exports.app.use("/api/notifications", notifications_routes_1.notificationsRouter);
exports.app.use("/api/settings", settings_routes_1.settingsRouter);
exports.app.use("/api/platform", platform_routes_1.platformRouter);
// Single-deployment mode: when the web app has been built (apps/web/dist), serve it from this
// same server so the frontend's relative "/api" calls hit the API on the same origin. Skipped
// when the build isn't there (local dev uses Vite's own server instead).
const WEB_DIST = [path_1.default.resolve(__dirname, "../../web/dist"), path_1.default.resolve(__dirname, "../../../web/dist")].find((p) => fs_1.default.existsSync(path_1.default.join(p, "index.html")));
if (WEB_DIST) {
    exports.app.use(express_1.default.static(WEB_DIST));
    exports.app.get(/^\/(?!api\/|uploads\/|health$).*/, (_req, res) => {
        res.sendFile(path_1.default.join(WEB_DIST, "index.html"));
    });
}
exports.app.use(errorHandler_1.notFoundHandler);
exports.app.use(errorHandler_1.errorHandler);
