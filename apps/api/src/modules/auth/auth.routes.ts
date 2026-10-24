import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/auth";
import { loginSchema, registerBusinessSchema } from "./auth.validation";
import * as authService from "./auth.service";
import { UnauthorizedError } from "../../lib/errors";
import { env } from "../../config/env";

export const authRouter = Router();

const REFRESH_COOKIE = "refresh_token";
// Frontend and backend deploy to separate subdomains in production (no shared origin for the
// dev proxy to paper over), so the refresh cookie needs SameSite=None there to be sent at all on
// cross-origin requests; locally (and for same-origin prod setups) Lax is the safer default.
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
  path: "/api/auth",
};

// Auth endpoints are brute-force targets; throttle harder than the general API limiter.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
// Refresh tokens are 48 random bytes (infeasible to brute force), so this is about capping
// abuse/DoS rather than guessing — a much higher ceiling than login is fine.
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

authRouter.post("/register-business", authLimiter, validateBody(registerBusinessSchema), async (req, res, next) => {
  try {
    const result = await authService.registerBusiness(req.body);
    res.status(201).json({
      tenant: { id: result.tenant.id, businessName: result.tenant.businessName },
      branch: { id: result.branch.id, name: result.branch.name },
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(req.body, { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined });
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", refreshLimiter, async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedError("Missing refresh token");
    const result = await authService.refresh(token, { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined });
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
    res.json({ accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", refreshLimiter, async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await authService.logout(token);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", authenticate, (req, res) => {
  res.json({
    id: req.user!.id,
    name: req.user!.name,
    email: req.user!.email,
    username: req.user!.username,
    tenantId: req.user!.tenantId,
    roleId: req.user!.roleId,
    branchIds: req.user!.branchIds,
    permissions: Array.from(req.user!.permissionCodes),
  });
});
