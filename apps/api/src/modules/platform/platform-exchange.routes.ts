import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { validateBody } from "../../middleware/validate";
import { ValidationError } from "../../lib/errors";
import { env } from "../../config/env";
import { consumeExchangeCode } from "./impersonation-store";

// Mounted onto /api/auth in app.ts (a second, narrow app.use line) rather than folded into
// auth.routes.ts, so that existing file stays untouched. This is the one tenant-side endpoint
// the impersonation hand-off needs: it mints a NORMAL tenant session from a one-time code, by
// setting the exact same refresh_token cookie a real /api/auth/login would — nothing downstream
// (AuthContext, client.ts, authenticate()) needs to know impersonation exists at all.
export const platformExchangeRouter = Router();

const REFRESH_COOKIE = "refresh_token";
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
};

const exchangeSchema = z.object({ code: z.string().min(1) });

// Codes are 24 random bytes (infeasible to brute force), so this caps abuse/DoS rather than
// guessing — but still worth bounding since this endpoint needs no auth to call.
const exchangeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

platformExchangeRouter.post("/exchange-impersonation-code", exchangeLimiter, validateBody(exchangeSchema), (req, res, next) => {
  try {
    const result = consumeExchangeCode(req.body.code);
    if (!result) throw new ValidationError("This access link has expired or was already used");
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
    res.json({ accessToken: result.accessToken });
  } catch (err) {
    next(err);
  }
});
