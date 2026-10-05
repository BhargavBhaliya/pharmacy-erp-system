import crypto from "node:crypto";
import type { Request } from "express";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../lib/password";
import { seedDefaultRolesForTenant } from "../../lib/tenantSetup";
import { nextStoreCode } from "../../lib/storeCode";
import { generateRefreshToken, hashRefreshToken, refreshTokenExpiryDate, signAccessToken } from "../../lib/jwt";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors";
import { recordPlatformAudit } from "./platform-audit";
import { createExchangeCode } from "./impersonation-store";
import type { CreateStoreInput, ListStoresQuery, UpdateStoreInput } from "./platform.validation";

// Deliberately a near-duplicate of auth.service.ts's registerBusiness rather than a call
// through to it: registerBusiness's signature/return shape is a public contract already
// covered by its own test suite, and this is the lowest-risk way to add storeCode generation
// without touching that function. Both call the same unchanged seedDefaultRolesForTenant.
export async function createStore(input: CreateStoreInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError("An account with this email already exists");

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const storeCode = await nextStoreCode(tx);
    const tenant = await tx.tenant.create({
      data: { businessName: input.businessName, ownerName: input.ownerName, email: input.email, phone: input.phone, storeCode },
    });

    const branch = await tx.branch.create({
      data: { tenantId: tenant.id, name: "Main Branch", invoicePrefix: "INV" },
    });
    await tx.warehouse.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Main Warehouse" } });
    await tx.counter.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Counter 1" } });

    const roleIdByName = await seedDefaultRolesForTenant(tenant.id, tx);
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: input.ownerName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        roleId: roleIdByName.get("Super Admin")!,
      },
    });

    return { tenant, branch, user };
  });
}

export async function listStores(query: ListStoresQuery) {
  const where = {
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search
      ? {
          OR: [
            { businessName: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
            { storeCode: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, tenants] = await Promise.all([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      include: { _count: { select: { users: true, branches: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const data = tenants.map((t) => ({
    id: t.id,
    storeCode: t.storeCode,
    businessName: t.businessName,
    ownerName: t.ownerName,
    email: t.email,
    phone: t.phone,
    isActive: t.isActive,
    createdAt: t.createdAt,
    userCount: t._count.users,
    branchCount: t._count.branches,
  }));

  return { data, pagination: { page: query.page, pageSize: query.pageSize, total } };
}

async function requireStore(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { _count: { select: { users: true, branches: true } } },
  });
  if (!tenant) throw new NotFoundError("Store not found");
  return tenant;
}

export async function getStoreDetail(tenantId: string) {
  return requireStore(tenantId);
}

export async function updateStoreDetails(tenantId: string, input: UpdateStoreInput) {
  await requireStore(tenantId);
  return prisma.tenant.update({ where: { id: tenantId }, data: input });
}

export async function setStoreActive(req: Request, tenantId: string, isActive: boolean) {
  await requireStore(tenantId);
  const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { isActive } });
  recordPlatformAudit({
    req,
    tenantId,
    action: isActive ? "activate_store" : "deactivate_store",
    entityType: "Tenant",
    entityId: tenantId,
  });
  return tenant;
}

const storeUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
} as const;

export async function listStoreUsers(tenantId: string) {
  await requireStore(tenantId);
  return prisma.user.findMany({
    where: { tenantId, deletedAt: null },
    select: storeUserSelect,
    orderBy: { name: "asc" },
  });
}

function generateRandomPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export async function resetStoreUserPassword(req: Request, tenantId: string, userId: string, newPassword?: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId, deletedAt: null } });
  if (!user) throw new NotFoundError("Store user not found");

  const plainPassword = newPassword ?? generateRandomPassword();
  const passwordHash = await hashPassword(plainPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: true } }),
    // Force re-login everywhere, mirroring users.routes.ts's own change-password security pattern.
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  recordPlatformAudit({
    req,
    tenantId,
    action: "force_password_reset",
    entityType: "User",
    entityId: user.id,
  });

  // Only returned here, once, over HTTPS — never logged, never stored in plaintext anywhere.
  return { generatedPassword: newPassword ? undefined : plainPassword };
}

export async function impersonateStoreUser(req: Request, tenantId: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId, deletedAt: null, isActive: true } });
  if (!user) throw new NotFoundError("Store user not found or inactive");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError("Store not found");
  if (!tenant.isActive) throw new ValidationError("Cannot access a deactivated store");

  // Issues a completely normal tenant session — same functions, same RefreshToken table — so
  // it behaves identically to a real login from this point forward (rotation, logout, etc.
  // all just work with zero special-casing anywhere else in the app).
  const accessToken = signAccessToken({ sub: user.id, tenantId: user.tenantId, roleId: user.roleId });
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiryDate(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    },
  });

  recordPlatformAudit({
    req,
    tenantId,
    action: "impersonate_login",
    entityType: "User",
    entityId: user.id,
    newValue: { impersonatedUserEmail: user.email },
  });

  const exchangeCode = createExchangeCode(accessToken, refreshToken);
  return { exchangeCode };
}

export async function getStoreActivity(tenantId: string) {
  const tenant = await requireStore(tenantId);
  const recentAuditLogs = await prisma.auditLog.findMany({
    where: { tenantId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return {
    stats: { userCount: tenant._count.users, branchCount: tenant._count.branches },
    recentAuditLogs,
  };
}
