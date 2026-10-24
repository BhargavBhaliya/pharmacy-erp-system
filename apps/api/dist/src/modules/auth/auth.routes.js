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
exports.authRouter = void 0;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const validate_1 = require("../../middleware/validate");
const auth_1 = require("../../middleware/auth");
const auth_validation_1 = require("./auth.validation");
const authService = __importStar(require("./auth.service"));
const errors_1 = require("../../lib/errors");
const env_1 = require("../../config/env");
exports.authRouter = (0, express_1.Router)();
const REFRESH_COOKIE = "refresh_token";
// Frontend and backend deploy to separate subdomains in production (no shared origin for the
// dev proxy to paper over), so the refresh cookie needs SameSite=None there to be sent at all on
// cross-origin requests; locally (and for same-origin prod setups) Lax is the safer default.
const cookieOptions = {
    httpOnly: true,
    secure: env_1.env.NODE_ENV === "production",
    sameSite: (env_1.env.NODE_ENV === "production" ? "none" : "lax"),
    path: "/api/auth",
};
// Auth endpoints are brute-force targets; throttle harder than the general API limiter.
const authLimiter = (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
// Refresh tokens are 48 random bytes (infeasible to brute force), so this is about capping
// abuse/DoS rather than guessing — a much higher ceiling than login is fine.
const refreshLimiter = (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
exports.authRouter.post("/register-business", authLimiter, (0, validate_1.validateBody)(auth_validation_1.registerBusinessSchema), async (req, res, next) => {
    try {
        const result = await authService.registerBusiness(req.body);
        res.status(201).json({
            tenant: { id: result.tenant.id, businessName: result.tenant.businessName },
            branch: { id: result.branch.id, name: result.branch.name },
            user: { id: result.user.id, email: result.user.email, name: result.user.name },
        });
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.post("/login", authLimiter, (0, validate_1.validateBody)(auth_validation_1.loginSchema), async (req, res, next) => {
    try {
        const result = await authService.login(req.body, { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined });
        res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
        res.json({ accessToken: result.accessToken, user: result.user });
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.post("/refresh", refreshLimiter, async (req, res, next) => {
    try {
        const token = req.cookies?.[REFRESH_COOKIE];
        if (!token)
            throw new errors_1.UnauthorizedError("Missing refresh token");
        const result = await authService.refresh(token, { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined });
        res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
        res.json({ accessToken: result.accessToken });
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.post("/logout", refreshLimiter, async (req, res, next) => {
    try {
        const token = req.cookies?.[REFRESH_COOKIE];
        if (token)
            await authService.logout(token);
        res.clearCookie(REFRESH_COOKIE, cookieOptions);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.get("/me", auth_1.authenticate, (req, res) => {
    res.json({
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        username: req.user.username,
        tenantId: req.user.tenantId,
        roleId: req.user.roleId,
        branchIds: req.user.branchIds,
        permissions: Array.from(req.user.permissionCodes),
    });
});
