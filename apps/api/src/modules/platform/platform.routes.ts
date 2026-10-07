import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validateBody } from "../../middleware/validate";
import { authenticatePlatformAdmin } from "../../middleware/platformAuth";
import { UnauthorizedError } from "../../lib/errors";
import { env } from "../../config/env";
import {
  bulkStoreActionSchema,
  changePlatformAdminPasswordSchema,
  createStoreNoteSchema,
  createStoreSchema,
  listStoresQuerySchema,
  platformLoginSchema,
  recordPaymentSchema,
  resetUserPasswordSchema,
  updatePlatformAdminSchema,
  updateStoreSchema,
  upsertSubscriptionSchema,
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
// Refresh tokens are 48 random bytes (infeasible to brute force), so this is about capping
// abuse/DoS rather than guessing — a much higher ceiling than login is fine.
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

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

platformRouter.post("/auth/refresh", refreshLimiter, async (req, res, next) => {
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

platformRouter.post("/auth/logout", refreshLimiter, async (req, res, next) => {
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

platformRouter.put(
  "/auth/me",
  authenticatePlatformAdmin,
  validateBody(updatePlatformAdminSchema),
  async (req, res, next) => {
    try {
      const admin = await platformAuthService.updatePlatformAdminProfile(req.platformAdmin!.id, req.body);
      res.json({ id: admin.id, name: admin.name, email: admin.email });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.post(
  "/auth/change-password",
  authenticatePlatformAdmin,
  validateBody(changePlatformAdminPasswordSchema),
  async (req, res, next) => {
    try {
      await platformAuthService.changePlatformAdminPassword(req.platformAdmin!.id, req.body);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

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

// Must come before "/stores/:tenantId" — otherwise Express would match "bulk-activate" as a
// :tenantId value.
platformRouter.post("/stores/bulk-activate", validateBody(bulkStoreActionSchema), async (req, res, next) => {
  try {
    const result = await platformService.bulkSetStoreActive(req, req.body.tenantIds, true);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

platformRouter.post("/stores/bulk-deactivate", validateBody(bulkStoreActionSchema), async (req, res, next) => {
  try {
    const result = await platformService.bulkSetStoreActive(req, req.body.tenantIds, false);
    res.json({ data: result });
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

platformRouter.get("/stores/:tenantId/notes", async (req, res, next) => {
  try {
    const notes = await platformService.listStoreNotes(req.params.tenantId);
    res.json({ data: notes });
  } catch (err) {
    next(err);
  }
});

platformRouter.post("/stores/:tenantId/notes", validateBody(createStoreNoteSchema), async (req, res, next) => {
  try {
    const note = await platformService.addStoreNote(req, req.params.tenantId, req.body);
    res.status(201).json({ data: note });
  } catch (err) {
    next(err);
  }
});

// --- Subscription & payments ---------------------------------------------------------------

platformRouter.get("/billing-overview", async (_req, res, next) => {
  try {
    const data = await platformService.getBillingOverview();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

platformRouter.get("/stores/:tenantId/subscription", async (req, res, next) => {
  try {
    const subscription = await platformService.getStoreSubscription(req.params.tenantId);
    res.json({ data: subscription });
  } catch (err) {
    next(err);
  }
});

platformRouter.put("/stores/:tenantId/subscription", validateBody(upsertSubscriptionSchema), async (req, res, next) => {
  try {
    const subscription = await platformService.upsertStoreSubscription(req.params.tenantId, req.body);
    res.json({ data: subscription });
  } catch (err) {
    next(err);
  }
});

platformRouter.get("/stores/:tenantId/payments", async (req, res, next) => {
  try {
    const payments = await platformService.listStorePayments(req.params.tenantId);
    res.json({ data: payments });
  } catch (err) {
    next(err);
  }
});

platformRouter.get("/stores/:tenantId/payments/:paymentId", async (req, res, next) => {
  try {
    const result = await platformService.getStorePayment(req.params.tenantId, req.params.paymentId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

platformRouter.post("/stores/:tenantId/payments", validateBody(recordPaymentSchema), async (req, res, next) => {
  try {
    const payment = await platformService.recordStorePayment(req.params.tenantId, req.body);
    res.status(201).json({ data: payment });
  } catch (err) {
    next(err);
  }
});

// --- Dashboard -------------------------------------------------------------------------

platformRouter.get("/dashboard", async (_req, res, next) => {
  try {
    const summary = await platformService.getDashboardSummary();
    res.json({ data: summary });
  } catch (err) {
    next(err);
  }
});
