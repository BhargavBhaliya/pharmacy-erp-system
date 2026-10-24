"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStore = createStore;
exports.listStores = listStores;
exports.getStoreDetail = getStoreDetail;
exports.updateStoreDetails = updateStoreDetails;
exports.setStoreActive = setStoreActive;
exports.bulkSetStoreActive = bulkSetStoreActive;
exports.listStoreUsers = listStoreUsers;
exports.resetStoreUserPassword = resetStoreUserPassword;
exports.impersonateStoreUser = impersonateStoreUser;
exports.getStoreActivity = getStoreActivity;
exports.listStoreNotes = listStoreNotes;
exports.addStoreNote = addStoreNote;
exports.getStoreSubscription = getStoreSubscription;
exports.upsertStoreSubscription = upsertStoreSubscription;
exports.recordStorePayment = recordStorePayment;
exports.listStorePayments = listStorePayments;
exports.getStorePayment = getStorePayment;
exports.getBillingOverview = getBillingOverview;
exports.getDashboardSummary = getDashboardSummary;
const node_crypto_1 = __importDefault(require("node:crypto"));
const prisma_1 = require("../../lib/prisma");
const password_1 = require("../../lib/password");
const tenantSetup_1 = require("../../lib/tenantSetup");
const storeCode_1 = require("../../lib/storeCode");
const username_1 = require("../../lib/username");
const jwt_1 = require("../../lib/jwt");
const errors_1 = require("../../lib/errors");
const platform_audit_1 = require("./platform-audit");
const impersonation_store_1 = require("./impersonation-store");
// Deliberately a near-duplicate of auth.service.ts's registerBusiness rather than a call
// through to it: registerBusiness's signature/return shape is a public contract already
// covered by its own test suite, and this is the lowest-risk way to add storeCode generation
// without touching that function. Both call the same unchanged seedDefaultRolesForTenant.
async function createStore(input) {
    const existing = await prisma_1.prisma.user.findUnique({ where: { email: input.email } });
    if (existing)
        throw new errors_1.ConflictError("An account with this email already exists");
    const passwordHash = await (0, password_1.hashPassword)(input.password);
    // Retries the WHOLE transaction (not a query inside it) on a username collision — see
    // withUniqueUsername's own comment for why that's necessary over retrying in place.
    return (0, username_1.withUniqueUsername)(prisma_1.prisma, input.ownerName, "user", (username) => prisma_1.prisma.$transaction(async (tx) => {
        const storeCode = await (0, storeCode_1.nextStoreCode)(tx);
        const tenant = await tx.tenant.create({
            data: { businessName: input.businessName, ownerName: input.ownerName, email: input.email, phone: input.phone, storeCode },
        });
        const branch = await tx.branch.create({
            data: { tenantId: tenant.id, name: "Main Branch", invoicePrefix: "INV" },
        });
        await tx.warehouse.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Main Warehouse" } });
        await tx.counter.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Counter 1" } });
        const roleIdByName = await (0, tenantSetup_1.seedDefaultRolesForTenant)(tenant.id, tx);
        const user = await tx.user.create({
            data: {
                tenantId: tenant.id,
                name: input.ownerName,
                email: input.email,
                username,
                phone: input.phone,
                passwordHash,
                roleId: roleIdByName.get("Super Admin"),
            },
        });
        return { tenant, branch, user };
    }));
}
async function listStores(query) {
    const where = {
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search
            ? {
                OR: [
                    { businessName: { contains: query.search } },
                    { email: { contains: query.search } },
                    { storeCode: { contains: query.search } },
                ],
            }
            : {}),
    };
    const [total, tenants] = await Promise.all([
        prisma_1.prisma.tenant.count({ where }),
        prisma_1.prisma.tenant.findMany({
            where,
            include: { _count: { select: { users: true, branches: true } }, subscription: true },
            orderBy: { createdAt: "desc" },
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
        }),
    ]);
    const now = new Date();
    const data = tenants.map((t) => ({
        id: t.id,
        storeCode: t.storeCode,
        businessName: t.businessName,
        ownerName: t.ownerName,
        email: t.email,
        phone: t.phone,
        isActive: t.isActive,
        createdAt: t.createdAt,
        subscriptionStatus: t.subscription?.status ?? "NO_PLAN",
        nextDueDate: t.subscription?.nextDueDate ?? null,
        isOverdue: Boolean(t.subscription?.nextDueDate && t.subscription.nextDueDate < now && t.subscription.status !== "CANCELLED"),
        userCount: t._count.users,
        branchCount: t._count.branches,
    }));
    return { data, pagination: { page: query.page, pageSize: query.pageSize, total } };
}
async function requireStore(tenantId) {
    const tenant = await prisma_1.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { _count: { select: { users: true, branches: true } } },
    });
    if (!tenant)
        throw new errors_1.NotFoundError("Store not found");
    return tenant;
}
async function getStoreDetail(tenantId) {
    return requireStore(tenantId);
}
async function updateStoreDetails(tenantId, input) {
    await requireStore(tenantId);
    return prisma_1.prisma.tenant.update({ where: { id: tenantId }, data: input });
}
async function setStoreActive(req, tenantId, isActive) {
    await requireStore(tenantId);
    const tenant = await prisma_1.prisma.tenant.update({ where: { id: tenantId }, data: { isActive } });
    (0, platform_audit_1.recordPlatformAudit)({
        req,
        tenantId,
        action: isActive ? "activate_store" : "deactivate_store",
        entityType: "Tenant",
        entityId: tenantId,
    });
    return tenant;
}
// Applies activate/deactivate to several stores in one request, skipping any id that doesn't
// exist rather than failing the whole batch — a typo'd/stale id in a bulk selection shouldn't
// block the stores that are valid. Each store still gets its own audit row, same as the
// single-store endpoint, so a bulk action is exactly as visible to each store as an individual
// one. Unlike recordPlatformAudit elsewhere (deliberately fire-and-forget for single actions),
// these rows are written with a single awaited createMany — a bulk action over many stores
// should give the caller a stronger guarantee that every row landed before the response returns,
// not a loop of unawaited writes racing the HTTP response.
async function bulkSetStoreActive(req, tenantIds, isActive) {
    const existing = await prisma_1.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true } });
    const existingIds = existing.map((t) => t.id);
    if (existingIds.length > 0) {
        const admin = req.platformAdmin;
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.tenant.updateMany({ where: { id: { in: existingIds } }, data: { isActive } }),
            prisma_1.prisma.auditLog.createMany({
                data: existingIds.map((tenantId) => ({
                    tenantId,
                    userId: null,
                    module: "platform_admin",
                    action: isActive ? "activate_store" : "deactivate_store",
                    entityType: "Tenant",
                    entityId: tenantId,
                    newValue: { platformAdminId: admin.id, platformAdminEmail: admin.email, bulk: true },
                    ipAddress: req.ip,
                    userAgent: req.get("user-agent") ?? undefined,
                })),
            }),
        ]);
    }
    return { updatedCount: existingIds.length, skippedIds: tenantIds.filter((id) => !existingIds.includes(id)) };
}
const storeUserSelect = {
    id: true,
    name: true,
    email: true,
    username: true,
    phone: true,
    isActive: true,
    lastLoginAt: true,
    createdAt: true,
    role: { select: { id: true, name: true } },
};
async function listStoreUsers(tenantId) {
    await requireStore(tenantId);
    return prisma_1.prisma.user.findMany({
        where: { tenantId, deletedAt: null },
        select: storeUserSelect,
        orderBy: { name: "asc" },
    });
}
function generateRandomPassword() {
    return node_crypto_1.default.randomBytes(9).toString("base64url");
}
async function resetStoreUserPassword(req, tenantId, userId, newPassword) {
    const user = await prisma_1.prisma.user.findFirst({ where: { id: userId, tenantId, deletedAt: null } });
    if (!user)
        throw new errors_1.NotFoundError("Store user not found");
    const plainPassword = newPassword ?? generateRandomPassword();
    const passwordHash = await (0, password_1.hashPassword)(plainPassword);
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: true } }),
        // Force re-login everywhere, mirroring users.routes.ts's own change-password security pattern.
        prisma_1.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    (0, platform_audit_1.recordPlatformAudit)({
        req,
        tenantId,
        action: "force_password_reset",
        entityType: "User",
        entityId: user.id,
    });
    // Only returned here, once, over HTTPS — never logged, never stored in plaintext anywhere.
    return { generatedPassword: newPassword ? undefined : plainPassword };
}
async function impersonateStoreUser(req, tenantId, userId) {
    const user = await prisma_1.prisma.user.findFirst({ where: { id: userId, tenantId, deletedAt: null, isActive: true } });
    if (!user)
        throw new errors_1.NotFoundError("Store user not found or inactive");
    const tenant = await prisma_1.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant)
        throw new errors_1.NotFoundError("Store not found");
    if (!tenant.isActive)
        throw new errors_1.ValidationError("Cannot access a deactivated store");
    // Issues a completely normal tenant session — same functions, same RefreshToken table — so
    // it behaves identically to a real login from this point forward (rotation, logout, etc.
    // all just work with zero special-casing anywhere else in the app).
    const accessToken = (0, jwt_1.signAccessToken)({ sub: user.id, tenantId: user.tenantId, roleId: user.roleId });
    const refreshToken = (0, jwt_1.generateRefreshToken)();
    await prisma_1.prisma.refreshToken.create({
        data: {
            userId: user.id,
            tokenHash: (0, jwt_1.hashRefreshToken)(refreshToken),
            expiresAt: (0, jwt_1.refreshTokenExpiryDate)(),
            ipAddress: req.ip,
            userAgent: req.get("user-agent") ?? undefined,
        },
    });
    (0, platform_audit_1.recordPlatformAudit)({
        req,
        tenantId,
        action: "impersonate_login",
        entityType: "User",
        entityId: user.id,
        newValue: { impersonatedUserEmail: user.email },
    });
    const exchangeCode = (0, impersonation_store_1.createExchangeCode)(accessToken, refreshToken);
    return { exchangeCode };
}
async function getStoreActivity(tenantId) {
    const tenant = await requireStore(tenantId);
    const recentAuditLogs = await prisma_1.prisma.auditLog.findMany({
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
// --- Internal support notes -------------------------------------------------------------
async function listStoreNotes(tenantId) {
    await requireStore(tenantId);
    return prisma_1.prisma.storeNote.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
}
async function addStoreNote(req, tenantId, input) {
    await requireStore(tenantId);
    const note = await prisma_1.prisma.storeNote.create({
        data: {
            tenantId,
            note: input.note,
            createdByName: req.platformAdmin.name,
            createdByEmail: req.platformAdmin.email,
        },
    });
    (0, platform_audit_1.recordPlatformAudit)({ req, tenantId, action: "add_note", entityType: "StoreNote", entityId: note.id });
    return note;
}
// --- Subscription & payments ---------------------------------------------------------------
async function getStoreSubscription(tenantId) {
    await requireStore(tenantId);
    return prisma_1.prisma.storeSubscription.findUnique({ where: { tenantId } });
}
async function upsertStoreSubscription(tenantId, input) {
    await requireStore(tenantId);
    return prisma_1.prisma.storeSubscription.upsert({
        where: { tenantId },
        create: { tenantId, ...input },
        update: input,
    });
}
function addBillingCycle(date, cycle) {
    const next = new Date(date);
    if (cycle === "MONTHLY")
        next.setMonth(next.getMonth() + 1);
    else if (cycle === "QUARTERLY")
        next.setMonth(next.getMonth() + 3);
    else
        next.setFullYear(next.getFullYear() + 1);
    return next;
}
async function recordStorePayment(tenantId, input) {
    await requireStore(tenantId);
    const payment = await prisma_1.prisma.storePayment.create({
        data: {
            tenantId,
            amount: input.amount,
            paymentMode: input.paymentMode,
            referenceNumber: input.referenceNumber,
            notes: input.notes,
        },
    });
    if (input.extendDueDate) {
        const subscription = await prisma_1.prisma.storeSubscription.findUnique({ where: { tenantId } });
        if (subscription) {
            const base = subscription.nextDueDate && subscription.nextDueDate > new Date() ? subscription.nextDueDate : new Date();
            await prisma_1.prisma.storeSubscription.update({
                where: { tenantId },
                data: { nextDueDate: addBillingCycle(base, subscription.billingCycle), status: "ACTIVE" },
            });
        }
    }
    return payment;
}
async function listStorePayments(tenantId) {
    await requireStore(tenantId);
    return prisma_1.prisma.storePayment.findMany({ where: { tenantId }, orderBy: { paymentDate: "desc" } });
}
async function getStorePayment(tenantId, paymentId) {
    const tenant = await requireStore(tenantId);
    const payment = await prisma_1.prisma.storePayment.findFirst({ where: { id: paymentId, tenantId } });
    if (!payment)
        throw new errors_1.NotFoundError("Payment not found");
    return { payment, store: { businessName: tenant.businessName, storeCode: tenant.storeCode } };
}
// One row per store across the whole platform — lets the admin scan 50+ stores for who's
// overdue without opening each one individually.
async function getBillingOverview() {
    const tenants = await prisma_1.prisma.tenant.findMany({
        select: { id: true, storeCode: true, businessName: true, isActive: true, subscription: true },
        orderBy: { businessName: "asc" },
    });
    const now = new Date();
    return tenants.map((t) => ({
        id: t.id,
        storeCode: t.storeCode,
        businessName: t.businessName,
        isActive: t.isActive,
        planName: t.subscription?.planName ?? null,
        billingCycle: t.subscription?.billingCycle ?? null,
        amount: t.subscription?.amount ?? null,
        status: t.subscription?.status ?? "NO_PLAN",
        nextDueDate: t.subscription?.nextDueDate ?? null,
        isOverdue: Boolean(t.subscription?.nextDueDate &&
            t.subscription.nextDueDate < now &&
            t.subscription.status !== "CANCELLED"),
    }));
}
// --- Dashboard summary ------------------------------------------------------------------
function round2(n) {
    return Math.round(n * 100) / 100;
}
async function getDashboardSummary() {
    const now = new Date();
    const [totalStores, activeStores, subscriptions, totalCollectedAgg, recentPayments] = await Promise.all([
        prisma_1.prisma.tenant.count(),
        prisma_1.prisma.tenant.count({ where: { isActive: true } }),
        prisma_1.prisma.storeSubscription.findMany({ select: { status: true, amount: true, nextDueDate: true } }),
        prisma_1.prisma.storePayment.aggregate({ _sum: { amount: true } }),
        prisma_1.prisma.storePayment.findMany({
            orderBy: { paymentDate: "desc" },
            take: 10,
            include: { tenant: { select: { businessName: true, storeCode: true } } },
        }),
    ]);
    const subscriptionStats = { TRIAL: 0, ACTIVE: 0, PAST_DUE: 0, EXPIRED: 0, CANCELLED: 0 };
    let pendingDues = 0;
    let overdueStoreCount = 0;
    for (const s of subscriptions) {
        subscriptionStats[s.status] = (subscriptionStats[s.status] ?? 0) + 1;
        const isOverdue = s.nextDueDate && s.nextDueDate < now && s.status !== "CANCELLED";
        if (isOverdue) {
            pendingDues += Number(s.amount);
            overdueStoreCount += 1;
        }
    }
    const noPlanCount = totalStores - subscriptions.length;
    // Last 6 calendar months, including months with zero collection, for the trend chart.
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const paymentsForChart = await prisma_1.prisma.storePayment.findMany({
        where: { paymentDate: { gte: sixMonthsAgo } },
        select: { amount: true, paymentDate: true },
    });
    const monthlyMap = new Map();
    for (const p of paymentsForChart) {
        const key = p.paymentDate.toISOString().slice(0, 7);
        monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + Number(p.amount));
    }
    const monthlyCollection = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().slice(0, 7);
        monthlyCollection.push({ month: key, amount: round2(monthlyMap.get(key) ?? 0) });
    }
    const collectedThisMonth = monthlyMap.get(now.toISOString().slice(0, 7)) ?? 0;
    return {
        storeStats: { total: totalStores, active: activeStores, inactive: totalStores - activeStores },
        subscriptionStats: { ...subscriptionStats, NO_PLAN: noPlanCount },
        collection: {
            totalCollected: round2(Number(totalCollectedAgg._sum.amount ?? 0)),
            collectedThisMonth: round2(collectedThisMonth),
            pendingDues: round2(pendingDues),
            overdueStoreCount,
        },
        monthlyCollection,
        recentPayments: recentPayments.map((p) => ({
            id: p.id,
            amount: p.amount,
            paymentDate: p.paymentDate,
            storeName: p.tenant.businessName,
            storeCode: p.tenant.storeCode,
        })),
    };
}
