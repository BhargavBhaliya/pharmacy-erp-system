import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validateBody } from "../../middleware/validate";
import { authenticatePlatformAdmin } from "../../middleware/platformAuth";
import { UnauthorizedError } from "../../lib/errors";
import { env } from "../../config/env";
import {
  createStoreSchema,
  listStoresQuerySchema,
  platformLoginSchema,
  resetUserPasswordSchema,
  updateStoreSchema,
} from "./platform.validation";
import * as platformAuthService from "./platform-auth.service";
import * as platformService from "./platform.service";

export const platformRouter = Router();

const REFRESH_COOKIE = "platform_refresh_token";
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/platform/auth",
};

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

// --- Platform Admin auth -----------------------------------------------------------------

platformRouter.post("/auth/login", authLimiter, validateBody(platformLoginSchema), async (req, res, next) => {
  try {
    const result = await platformAuthService.platformLogin(req.body, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
    res.json({ accessToken: result.accessToken, admin: result.admin });
  } catch (err) {
    next(err);
  }
});

platformRouter.post("/auth/refresh", async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedError("Missing refresh token");
    const result = await platformAuthService.platformRefresh(token, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
    res.json({ accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});

platformRouter.post("/auth/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await platformAuthService.platformLogout(token);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

platformRouter.get("/auth/me", authenticatePlatformAdmin, (req, res) => {
  res.json(req.platformAdmin);
});

// --- Store management (all behind authenticatePlatformAdmin) -----------------------------

platformRouter.use(authenticatePlatformAdmin);

platformRouter.get("/stores", async (req, res, next) => {
  try {
    const query = listStoresQuerySchema.parse(req.query);
    const result = await platformService.listStores(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

platformRouter.post("/stores", validateBody(createStoreSchema), async (req, res, next) => {
  try {
    const result = await platformService.createStore(req.body);
    res.status(201).json({
      tenant: { id: result.tenant.id, storeCode: result.tenant.storeCode, businessName: result.tenant.businessName },
      branch: { id: result.branch.id, name: result.branch.name },
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
    });
  } catch (err) {
    next(err);
  }
});

platformRouter.get("/stores/:tenantId", async (req, res, next) => {
  try {
    const tenant = await platformService.getStoreDetail(req.params.tenantId);
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

platformRouter.put("/stores/:tenantId", validateBody(updateStoreSchema), async (req, res, next) => {
  try {
    const tenant = await platformService.updateStoreDetails(req.params.tenantId, req.body);
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

platformRouter.post("/stores/:tenantId/activate", async (req, res, next) => {
  try {
    const tenant = await platformService.setStoreActive(req, req.params.tenantId, true);
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

platformRouter.post("/stores/:tenantId/deactivate", async (req, res, next) => {
  try {
    const tenant = await platformService.setStoreActive(req, req.params.tenantId, false);
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

platformRouter.get("/stores/:tenantId/users", async (req, res, next) => {
  try {
    const users = await platformService.listStoreUsers(req.params.tenantId);
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
});

platformRouter.post(
  "/stores/:tenantId/users/:userId/reset-password",
  validateBody(resetUserPasswordSchema),
  async (req, res, next) => {
    try {
      const result = await platformService.resetStoreUserPassword(
        req,
        req.params.tenantId,
        req.params.userId,
        req.body.newPassword
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.post("/stores/:tenantId/users/:userId/impersonate", async (req, res, next) => {
  try {
    const result = await platformService.impersonateStoreUser(req, req.params.tenantId, req.params.userId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

platformRouter.get("/stores/:tenantId/activity", async (req, res, next) => {
  try {
    const result = await platformService.getStoreActivity(req.params.tenantId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
