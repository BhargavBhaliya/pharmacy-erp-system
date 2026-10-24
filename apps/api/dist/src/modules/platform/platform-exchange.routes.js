"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformExchangeRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const env_1 = require("../../config/env");
const impersonation_store_1 = require("./impersonation-store");
// Mounted onto /api/auth in app.ts (a second, narrow app.use line) rather than folded into
// auth.routes.ts, so that existing file stays untouched. This is the one tenant-side endpoint
// the impersonation hand-off needs: it mints a NORMAL tenant session from a one-time code, by
// setting the exact same refresh_token cookie a real /api/auth/login would — nothing downstream
// (AuthContext, client.ts, authenticate()) needs to know impersonation exists at all.
exports.platformExchangeRouter = (0, express_1.Router)();
const REFRESH_COOKIE = "refresh_token";
// See auth.routes.ts's cookieOptions comment — same cross-origin reasoning applies here.
const cookieOptions = {
    httpOnly: true,
    secure: env_1.env.NODE_ENV === "production",
    sameSite: (env_1.env.NODE_ENV === "production" ? "none" : "lax"),
    path: "/api/auth",
};
const exchangeSchema = zod_1.z.object({ code: zod_1.z.string().min(1) });
// Codes are 24 random bytes (infeasible to brute force), so this caps abuse/DoS rather than
// guessing — but still worth bounding since this endpoint needs no auth to call.
const exchangeLimiter = (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
exports.platformExchangeRouter.post("/exchange-impersonation-code", exchangeLimiter, (0, validate_1.validateBody)(exchangeSchema), (req, res, next) => {
    try {
        const result = (0, impersonation_store_1.consumeExchangeCode)(req.body.code);
        if (!result)
            throw new errors_1.ValidationError("This access link has expired or was already used");
        res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
        res.json({ accessToken: result.accessToken });
    }
    catch (err) {
        next(err);
    }
});
