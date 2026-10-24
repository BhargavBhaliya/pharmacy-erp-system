"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformRouter = void 0;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const validate_1 = require("../../middleware/validate");
const platformAuth_1 = require("../../middleware/platformAuth");
const errors_1 = require("../../lib/errors");
const env_1 = require("../../config/env");
const platform_validation_1 = require("./platform.validation");
const platformAuthService = __importStar(require("./platform-auth.service"));
const platformService = __importStar(require("./platform.service"));
exports.platformRouter = (0, express_1.Router)();
const REFRESH_COOKIE = "platform_refresh_token";
// See auth.routes.ts's cookieOptions comment — same cross-origin reasoning applies here.
const cookieOptions = {
    httpOnly: true,
    secure: env_1.env.NODE_ENV === "production",
    sameSite: (env_1.env.NODE_ENV === "production" ? "none" : "lax"),
    path: "/api/platform/auth",
};
const authLimiter = (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
// Refresh tokens are 48 random bytes (infeasible to brute force), so this is about capping
// abuse/DoS rather than guessing — a much higher ceiling than login is fine.
const refreshLimiter = (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
// --- Platform Admin auth -----------------------------------------------------------------
exports.platformRouter.post("/auth/login", authLimiter, (0, validate_1.validateBody)(platform_validation_1.platformLoginSchema), async (req, res, next) => {
    try {
        const result = await platformAuthService.platformLogin(req.body, {
            ipAddress: req.ip,
            userAgent: req.get("user-agent") ?? undefined,
        });
        res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
        res.json({ accessToken: result.accessToken, admin: result.admin });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.post("/auth/refresh", refreshLimiter, async (req, res, next) => {
    try {
        const token = req.cookies?.[REFRESH_COOKIE];
        if (!token)
            throw new errors_1.UnauthorizedError("Missing refresh token");
        const result = await platformAuthService.platformRefresh(token, {
            ipAddress: req.ip,
            userAgent: req.get("user-agent") ?? undefined,
        });
        res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
        res.json({ accessToken: result.accessToken });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.post("/auth/logout", refreshLimiter, async (req, res, next) => {
    try {
        const token = req.cookies?.[REFRESH_COOKIE];
        if (token)
            await platformAuthService.platformLogout(token);
        res.clearCookie(REFRESH_COOKIE, cookieOptions);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.get("/auth/me", platformAuth_1.authenticatePlatformAdmin, (req, res) => {
    res.json(req.platformAdmin);
});
exports.platformRouter.put("/auth/me", platformAuth_1.authenticatePlatformAdmin, (0, validate_1.validateBody)(platform_validation_1.updatePlatformAdminSchema), async (req, res, next) => {
    try {
        const admin = await platformAuthService.updatePlatformAdminProfile(req.platformAdmin.id, req.body);
        res.json({ id: admin.id, name: admin.name, email: admin.email });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.post("/auth/change-password", platformAuth_1.authenticatePlatformAdmin, (0, validate_1.validateBody)(platform_validation_1.changePlatformAdminPasswordSchema), async (req, res, next) => {
    try {
        await platformAuthService.changePlatformAdminPassword(req.platformAdmin.id, req.body);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// --- Store management (all behind authenticatePlatformAdmin) -----------------------------
exports.platformRouter.use(platformAuth_1.authenticatePlatformAdmin);
exports.platformRouter.get("/stores", async (req, res, next) => {
    try {
        const query = platform_validation_1.listStoresQuerySchema.parse(req.query);
        const result = await platformService.listStores(query);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.post("/stores", (0, validate_1.validateBody)(platform_validation_1.createStoreSchema), async (req, res, next) => {
    try {
        const result = await platformService.createStore(req.body);
        res.status(201).json({
            tenant: { id: result.tenant.id, storeCode: result.tenant.storeCode, businessName: result.tenant.businessName },
            branch: { id: result.branch.id, name: result.branch.name },
            user: { id: result.user.id, email: result.user.email, name: result.user.name },
        });
    }
    catch (err) {
        next(err);
    }
});
// Must come before "/stores/:tenantId" — otherwise Express would match "bulk-activate" as a
// :tenantId value.
exports.platformRouter.post("/stores/bulk-activate", (0, validate_1.validateBody)(platform_validation_1.bulkStoreActionSchema), async (req, res, next) => {
    try {
        const result = await platformService.bulkSetStoreActive(req, req.body.tenantIds, true);
        res.json({ data: result });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.post("/stores/bulk-deactivate", (0, validate_1.validateBody)(platform_validation_1.bulkStoreActionSchema), async (req, res, next) => {
    try {
        const result = await platformService.bulkSetStoreActive(req, req.body.tenantIds, false);
        res.json({ data: result });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.get("/stores/:tenantId", async (req, res, next) => {
    try {
        const tenant = await platformService.getStoreDetail(req.params.tenantId);
        res.json({ data: tenant });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.put("/stores/:tenantId", (0, validate_1.validateBody)(platform_validation_1.updateStoreSchema), async (req, res, next) => {
    try {
        const tenant = await platformService.updateStoreDetails(req.params.tenantId, req.body);
        res.json({ data: tenant });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.post("/stores/:tenantId/activate", async (req, res, next) => {
    try {
        const tenant = await platformService.setStoreActive(req, req.params.tenantId, true);
        res.json({ data: tenant });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.post("/stores/:tenantId/deactivate", async (req, res, next) => {
    try {
        const tenant = await platformService.setStoreActive(req, req.params.tenantId, false);
        res.json({ data: tenant });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.get("/stores/:tenantId/users", async (req, res, next) => {
    try {
        const users = await platformService.listStoreUsers(req.params.tenantId);
        res.json({ data: users });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.post("/stores/:tenantId/users/:userId/reset-password", (0, validate_1.validateBody)(platform_validation_1.resetUserPasswordSchema), async (req, res, next) => {
    try {
        const result = await platformService.resetStoreUserPassword(req, req.params.tenantId, req.params.userId, req.body.newPassword);
        res.json({ data: result });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.post("/stores/:tenantId/users/:userId/impersonate", async (req, res, next) => {
    try {
        const result = await platformService.impersonateStoreUser(req, req.params.tenantId, req.params.userId);
        res.json({ data: result });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.get("/stores/:tenantId/activity", async (req, res, next) => {
    try {
        const result = await platformService.getStoreActivity(req.params.tenantId);
        res.json({ data: result });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.get("/stores/:tenantId/notes", async (req, res, next) => {
    try {
        const notes = await platformService.listStoreNotes(req.params.tenantId);
        res.json({ data: notes });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.post("/stores/:tenantId/notes", (0, validate_1.validateBody)(platform_validation_1.createStoreNoteSchema), async (req, res, next) => {
    try {
        const note = await platformService.addStoreNote(req, req.params.tenantId, req.body);
        res.status(201).json({ data: note });
    }
    catch (err) {
        next(err);
    }
});
// --- Subscription & payments ---------------------------------------------------------------
exports.platformRouter.get("/billing-overview", async (_req, res, next) => {
    try {
        const data = await platformService.getBillingOverview();
        res.json({ data });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.get("/stores/:tenantId/subscription", async (req, res, next) => {
    try {
        const subscription = await platformService.getStoreSubscription(req.params.tenantId);
        res.json({ data: subscription });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.put("/stores/:tenantId/subscription", (0, validate_1.validateBody)(platform_validation_1.upsertSubscriptionSchema), async (req, res, next) => {
    try {
        const subscription = await platformService.upsertStoreSubscription(req.params.tenantId, req.body);
        res.json({ data: subscription });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.get("/stores/:tenantId/payments", async (req, res, next) => {
    try {
        const payments = await platformService.listStorePayments(req.params.tenantId);
        res.json({ data: payments });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.get("/stores/:tenantId/payments/:paymentId", async (req, res, next) => {
    try {
        const result = await platformService.getStorePayment(req.params.tenantId, req.params.paymentId);
        res.json({ data: result });
    }
    catch (err) {
        next(err);
    }
});
exports.platformRouter.post("/stores/:tenantId/payments", (0, validate_1.validateBody)(platform_validation_1.recordPaymentSchema), async (req, res, next) => {
    try {
        const payment = await platformService.recordStorePayment(req.params.tenantId, req.body);
        res.status(201).json({ data: payment });
    }
    catch (err) {
        next(err);
    }
});
// --- Dashboard -------------------------------------------------------------------------
exports.platformRouter.get("/dashboard", async (_req, res, next) => {
    try {
        const summary = await platformService.getDashboardSummary();
        res.json({ data: summary });
    }
    catch (err) {
        next(err);
    }
});
