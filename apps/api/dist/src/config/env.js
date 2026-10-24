"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    DATABASE_URL: zod_1.z.string().min(1, "DATABASE_URL is required"),
    JWT_ACCESS_SECRET: zod_1.z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 chars"),
    JWT_REFRESH_SECRET: zod_1.z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
    JWT_ACCESS_EXPIRES_IN: zod_1.z.string().default("15m"),
    JWT_REFRESH_EXPIRES_IN: zod_1.z.string().default("7d"),
    // Deliberately a different secret from JWT_ACCESS_SECRET so a tenant-user token can never be
    // decoded/accepted by the Platform Admin middleware, and vice versa, by construction.
    PLATFORM_JWT_ACCESS_SECRET: zod_1.z.string().min(16, "PLATFORM_JWT_ACCESS_SECRET must be at least 16 chars"),
    PLATFORM_JWT_ACCESS_EXPIRES_IN: zod_1.z.string().default("30m"),
    PLATFORM_JWT_REFRESH_EXPIRES_IN: zod_1.z.string().default("7d"),
    PORT: zod_1.z.coerce.number().default(4000),
    NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
    CORS_ORIGIN: zod_1.z.string().default("http://localhost:5173"),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
}
exports.env = parsed.data;
