import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { branchesRouter } from "./modules/branches/branches.routes";
import { usersRouter } from "./modules/users/users.routes";
import { rolesRouter } from "./modules/roles/roles.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ level: env.NODE_ENV === "test" ? "silent" : "info" }));

// Baseline API-wide limiter; auth routes layer a stricter one on top (see auth.routes.ts).
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/branches", branchesRouter);
app.use("/api/users", usersRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/audit-logs", auditRouter);

app.use(notFoundHandler);
app.use(errorHandler);
