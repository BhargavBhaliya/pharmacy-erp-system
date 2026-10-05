import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

// Mirrors lib/jwt.ts's mechanics exactly (opaque SHA-256-hashed refresh tokens, same expiry
// style) but with its own secret and a distinct payload shape, so a tenant-user access token
// can never be decoded/accepted here and a platform-admin token can never be accepted by the
// tenant `authenticate()` middleware — the two auth systems share no code path.
export interface PlatformAccessTokenPayload {
  sub: string; // platformAdminId
  scope: "platform";
}

export function signPlatformAccessToken(platformAdminId: string): string {
  const payload: PlatformAccessTokenPayload = { sub: platformAdminId, scope: "platform" };
  return jwt.sign(payload, env.PLATFORM_JWT_ACCESS_SECRET, {
    expiresIn: env.PLATFORM_JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyPlatformAccessToken(token: string): PlatformAccessTokenPayload {
  const payload = jwt.verify(token, env.PLATFORM_JWT_ACCESS_SECRET) as PlatformAccessTokenPayload;
  if (payload.scope !== "platform") throw new Error("Not a platform admin token");
  return payload;
}

export function generatePlatformRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashPlatformRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function platformRefreshTokenExpiryDate(): Date {
  const match = /^(\d+)([smhd])$/.exec(env.PLATFORM_JWT_REFRESH_EXPIRES_IN);
  const amount = match ? Number(match[1]) : 7;
  const unit = match ? match[2] : "d";
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return new Date(Date.now() + amount * (unitMs[unit] ?? unitMs.d));
}
