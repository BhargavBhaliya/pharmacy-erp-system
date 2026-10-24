"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBusiness = registerBusiness;
exports.login = login;
exports.refresh = refresh;
exports.logout = logout;
const prisma_1 = require("../../lib/prisma");
const password_1 = require("../../lib/password");
const jwt_1 = require("../../lib/jwt");
const tenantSetup_1 = require("../../lib/tenantSetup");
const storeCode_1 = require("../../lib/storeCode");
const username_1 = require("../../lib/username");
const errors_1 = require("../../lib/errors");
async function registerBusiness(input) {
    const existing = await prisma_1.prisma.user.findUnique({ where: { email: input.email } });
    if (existing)
        throw new errors_1.ConflictError("An account with this email already exists");
    const passwordHash = await (0, password_1.hashPassword)(input.password);
    // Retries the WHOLE transaction (not a query inside it) on a username collision — see
    // withUniqueUsername's own comment for why that's necessary over retrying in place.
    return (0, username_1.withUniqueUsername)(prisma_1.prisma, input.ownerName, "user", (username) => prisma_1.prisma.$transaction(async (tx) => {
        const storeCode = await (0, storeCode_1.nextStoreCode)(tx);
        const tenant = await tx.tenant.create({
            data: { businessName: input.businessName, ownerName: input.ownerName, email: input.email, storeCode },
        });
        // Default branch/warehouse/counter so the tenant is immediately usable.
        const branch = await tx.branch.create({
            data: { tenantId: tenant.id, name: "Main Branch", invoicePrefix: "INV" },
        });
        await tx.warehouse.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Main Warehouse" } });
        await tx.counter.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Counter 1" } });
        // Must run on `tx`, not the shared client: the tenant row isn't committed yet, so a
        // separate connection can't see it and role creation would fail its FK constraint.
        const roleIdByName = await (0, tenantSetup_1.seedDefaultRolesForTenant)(tenant.id, tx);
        const superAdminRoleId = roleIdByName.get("Super Admin");
        const user = await tx.user.create({
            data: {
                tenantId: tenant.id,
                name: input.ownerName,
                email: input.email,
                username,
                phone: input.phone,
                passwordHash,
                roleId: superAdminRoleId,
            },
        });
        return { tenant, branch, user };
    }));
}
// A valid-shaped bcrypt hash with no corresponding password. Used so a login against a
// nonexistent email still runs a real bcrypt comparison, taking the same ~100ms as a real
// user — otherwise the early-return path is near-instant and the response-time difference
// lets an attacker enumerate registered emails without ever guessing a password.
const DUMMY_PASSWORD_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uQxTmrjOq/Esu5tzJ2YN5yJzkC7WMZEa";
async function login(input, meta) {
    // Accepts either email or username as the identifier — both are globally unique, so a single
    // OR lookup finds the right row (if any) without needing to know up front which one was typed.
    const user = await prisma_1.prisma.user.findFirst({
        where: { OR: [{ email: input.email }, { username: input.email }] },
        include: { role: true, tenant: { select: { isActive: true } } },
    });
    const validPassword = await (0, password_1.verifyPassword)(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || user.deletedAt || !user.isActive || !user.tenant.isActive || !validPassword) {
        throw new errors_1.UnauthorizedError("Invalid email or password");
    }
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const accessToken = (0, jwt_1.signAccessToken)({ sub: user.id, tenantId: user.tenantId, roleId: user.roleId });
    const refreshToken = (0, jwt_1.generateRefreshToken)();
    await prisma_1.prisma.refreshToken.create({
        data: {
            userId: user.id,
            tokenHash: (0, jwt_1.hashRefreshToken)(refreshToken),
            expiresAt: (0, jwt_1.refreshTokenExpiryDate)(),
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
        },
    });
    return {
        accessToken,
        refreshToken,
        user: { id: user.id, name: user.name, email: user.email, username: user.username, roleName: user.role.name, tenantId: user.tenantId },
    };
}
async function refresh(rawToken, meta) {
    const tokenHash = (0, jwt_1.hashRefreshToken)(rawToken);
    const stored = await prisma_1.prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: { include: { tenant: { select: { isActive: true } } } } },
    });
    if (!stored ||
        stored.revokedAt ||
        stored.expiresAt < new Date() ||
        !stored.user.isActive ||
        stored.user.deletedAt ||
        !stored.user.tenant.isActive) {
        throw new errors_1.UnauthorizedError("Invalid or expired refresh token");
    }
    // Rotate: revoke the old token and issue a new one, so a leaked refresh token can only be
    // replayed once before the legitimate user's next refresh invalidates it.
    const newRefreshToken = (0, jwt_1.generateRefreshToken)();
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
        prisma_1.prisma.refreshToken.create({
            data: {
                userId: stored.userId,
                tokenHash: (0, jwt_1.hashRefreshToken)(newRefreshToken),
                expiresAt: (0, jwt_1.refreshTokenExpiryDate)(),
                ipAddress: meta.ipAddress,
                userAgent: meta.userAgent,
            },
        }),
    ]);
    const accessToken = (0, jwt_1.signAccessToken)({
        sub: stored.user.id,
        tenantId: stored.user.tenantId,
        roleId: stored.user.roleId,
    });
    return { accessToken, refreshToken: newRefreshToken };
}
async function logout(rawToken) {
    const tokenHash = (0, jwt_1.hashRefreshToken)(rawToken);
    await prisma_1.prisma.refreshToken
        .updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })
        .catch(() => undefined);
}
