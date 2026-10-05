import { prisma } from "../../lib/prisma";
import { verifyPassword } from "../../lib/password";
import {
  generatePlatformRefreshToken,
  hashPlatformRefreshToken,
  platformRefreshTokenExpiryDate,
  signPlatformAccessToken,
} from "../../lib/platformJwt";
import { UnauthorizedError } from "../../lib/errors";
import type { PlatformLoginInput } from "./platform.validation";

// Same anti-timing-enumeration trick as auth.service.ts's login() — duplicated rather than
// imported, since these are two independent auth systems and a shared constant would be an
// unnecessary coupling between them.
const DUMMY_PASSWORD_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uQxTmrjOq/Esu5tzJ2YN5yJzkC7WMZEa";

export async function platformLogin(input: PlatformLoginInput, meta: { ipAddress?: string; userAgent?: string }) {
  const admin = await prisma.platformAdmin.findUnique({ where: { email: input.email } });

  const validPassword = await verifyPassword(input.password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!admin || !validPassword) {
    throw new UnauthorizedError("Invalid email or password");
  }

  await prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

  const accessToken = signPlatformAccessToken(admin.id);
  const refreshToken = generatePlatformRefreshToken();
  await prisma.platformRefreshToken.create({
    data: {
      platformAdminId: admin.id,
      tokenHash: hashPlatformRefreshToken(refreshToken),
      expiresAt: platformRefreshTokenExpiryDate(),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  return {
    accessToken,
    refreshToken,
    admin: { id: admin.id, name: admin.name, email: admin.email },
  };
}

export async function platformRefresh(rawToken: string, meta: { ipAddress?: string; userAgent?: string }) {
  const tokenHash = hashPlatformRefreshToken(rawToken);
  const stored = await prisma.platformRefreshToken.findUnique({
    where: { tokenHash },
    include: { platformAdmin: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  // Rotate: revoke the old token and issue a new one, same pattern as the tenant auth flow.
  const newRefreshToken = generatePlatformRefreshToken();
  await prisma.$transaction([
    prisma.platformRefreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
    prisma.platformRefreshToken.create({
      data: {
        platformAdminId: stored.platformAdminId,
        tokenHash: hashPlatformRefreshToken(newRefreshToken),
        expiresAt: platformRefreshTokenExpiryDate(),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    }),
  ]);

  const accessToken = signPlatformAccessToken(stored.platformAdminId);
  return { accessToken, refreshToken: newRefreshToken };
}

export async function platformLogout(rawToken: string): Promise<void> {
  const tokenHash = hashPlatformRefreshToken(rawToken);
  await prisma.platformRefreshToken
    .updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}
