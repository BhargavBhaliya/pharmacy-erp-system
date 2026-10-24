"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformLogin = platformLogin;
exports.platformRefresh = platformRefresh;
exports.platformLogout = platformLogout;
exports.updatePlatformAdminProfile = updatePlatformAdminProfile;
exports.changePlatformAdminPassword = changePlatformAdminPassword;
const prisma_1 = require("../../lib/prisma");
const password_1 = require("../../lib/password");
const platformJwt_1 = require("../../lib/platformJwt");
const errors_1 = require("../../lib/errors");
// Same anti-timing-enumeration trick as auth.service.ts's login() — duplicated rather than
// imported, since these are two independent auth systems and a shared constant would be an
// unnecessary coupling between them.
const DUMMY_PASSWORD_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uQxTmrjOq/Esu5tzJ2YN5yJzkC7WMZEa";
async function platformLogin(input, meta) {
    // Accepts either email or username as the identifier, same as the tenant login.
    const admin = await prisma_1.prisma.platformAdmin.findFirst({ where: { OR: [{ email: input.email }, { username: input.email }] } });
    const validPassword = await (0, password_1.verifyPassword)(input.password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!admin || !validPassword) {
        throw new errors_1.UnauthorizedError("Invalid email or password");
    }
    await prisma_1.prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    const accessToken = (0, platformJwt_1.signPlatformAccessToken)(admin.id);
    const refreshToken = (0, platformJwt_1.generatePlatformRefreshToken)();
    await prisma_1.prisma.platformRefreshToken.create({
        data: {
            platformAdminId: admin.id,
            tokenHash: (0, platformJwt_1.hashPlatformRefreshToken)(refreshToken),
            expiresAt: (0, platformJwt_1.platformRefreshTokenExpiryDate)(),
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
        },
    });
    return {
        accessToken,
        refreshToken,
        admin: { id: admin.id, name: admin.name, email: admin.email, username: admin.username },
    };
}
async function platformRefresh(rawToken, meta) {
    const tokenHash = (0, platformJwt_1.hashPlatformRefreshToken)(rawToken);
    const stored = await prisma_1.prisma.platformRefreshToken.findUnique({
        where: { tokenHash },
        include: { platformAdmin: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
        throw new errors_1.UnauthorizedError("Invalid or expired refresh token");
    }
    // Rotate: revoke the old token and issue a new one, same pattern as the tenant auth flow.
    const newRefreshToken = (0, platformJwt_1.generatePlatformRefreshToken)();
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.platformRefreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
        prisma_1.prisma.platformRefreshToken.create({
            data: {
                platformAdminId: stored.platformAdminId,
                tokenHash: (0, platformJwt_1.hashPlatformRefreshToken)(newRefreshToken),
                expiresAt: (0, platformJwt_1.platformRefreshTokenExpiryDate)(),
                ipAddress: meta.ipAddress,
                userAgent: meta.userAgent,
            },
        }),
    ]);
    const accessToken = (0, platformJwt_1.signPlatformAccessToken)(stored.platformAdminId);
    return { accessToken, refreshToken: newRefreshToken };
}
async function platformLogout(rawToken) {
    const tokenHash = (0, platformJwt_1.hashPlatformRefreshToken)(rawToken);
    await prisma_1.prisma.platformRefreshToken
        .updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })
        .catch(() => undefined);
}
async function updatePlatformAdminProfile(adminId, input) {
    if (input.email) {
        const existing = await prisma_1.prisma.platformAdmin.findUnique({ where: { email: input.email } });
        if (existing && existing.id !== adminId)
            throw new errors_1.ConflictError("An admin with this email already exists");
    }
    if (input.username) {
        const existing = await prisma_1.prisma.platformAdmin.findUnique({ where: { username: input.username } });
        if (existing && existing.id !== adminId)
            throw new errors_1.ConflictError("An admin with this username already exists");
    }
    return prisma_1.prisma.platformAdmin.update({ where: { id: adminId }, data: input });
}
async function changePlatformAdminPassword(adminId, input) {
    const admin = await prisma_1.prisma.platformAdmin.findUnique({ where: { id: adminId } });
    if (!admin)
        throw new errors_1.NotFoundError("Admin not found");
    const valid = await (0, password_1.verifyPassword)(input.currentPassword, admin.passwordHash);
    if (!valid)
        throw new errors_1.UnauthorizedError("Current password is incorrect");
    const passwordHash = await (0, password_1.hashPassword)(input.newPassword);
    await prisma_1.prisma.platformAdmin.update({ where: { id: adminId }, data: { passwordHash } });
    // Force re-login everywhere else after a password change, same as the tenant-user flow.
    await prisma_1.prisma.platformRefreshToken.updateMany({ where: { platformAdminId: adminId, revokedAt: null }, data: { revokedAt: new Date() } });
}
