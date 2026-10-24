"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const password_1 = require("../../lib/password");
const username_1 = require("../../lib/username");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const notify_1 = require("../../lib/notify");
const users_validation_1 = require("./users.validation");
exports.usersRouter = (0, express_1.Router)();
exports.usersRouter.use(auth_1.authenticate);
// A user with users.edit must not be able to assign a role carrying permissions they don't
// themselves hold — otherwise any user-management role could mint itself (or an accomplice
// account) full admin access via a role that happens to be more powerful than its own.
async function assertCanAssignRole(req, roleId) {
    const role = await prisma_1.prisma.role.findFirst({
        where: { id: roleId, tenantId: req.user.tenantId },
        include: { rolePermissions: { include: { permission: true }, where: { allowed: true } } },
    });
    if (!role)
        throw new errors_1.ValidationError("Invalid roleId for this tenant");
    const notHeld = role.rolePermissions.map((rp) => rp.permission.code).filter((code) => !req.user.permissionCodes.has(code));
    if (notHeld.length > 0) {
        throw new errors_1.ForbiddenError(`You cannot assign a role with permissions you don't have: ${notHeld.join(", ")}`);
    }
    return role;
}
const userSummarySelect = {
    id: true,
    name: true,
    email: true,
    username: true,
    phone: true,
    isActive: true,
    lastLoginAt: true,
    createdAt: true,
    role: { select: { id: true, name: true } },
    userBranches: { select: { branch: { select: { id: true, name: true } } } },
};
exports.usersRouter.get("/", (0, auth_1.requirePermission)("users", "view"), async (req, res, next) => {
    try {
        const users = await prisma_1.prisma.user.findMany({
            where: { tenantId: req.user.tenantId, deletedAt: null },
            select: userSummarySelect,
            orderBy: { name: "asc" },
        });
        res.json({ data: users });
    }
    catch (err) {
        next(err);
    }
});
exports.usersRouter.post("/", (0, auth_1.requirePermission)("users", "add"), (0, validate_1.validateBody)(users_validation_1.createUserSchema), async (req, res, next) => {
    try {
        const { branchIds, password, ...rest } = req.body;
        const existing = await prisma_1.prisma.user.findUnique({ where: { email: rest.email } });
        if (existing)
            throw new errors_1.ConflictError("An account with this email already exists");
        if (rest.username) {
            const existingUsername = await prisma_1.prisma.user.findUnique({ where: { username: rest.username } });
            if (existingUsername)
                throw new errors_1.ConflictError("This username is already taken");
        }
        const role = await assertCanAssignRole(req, rest.roleId);
        if (branchIds.length > 0) {
            const validBranches = await prisma_1.prisma.branch.count({ where: { id: { in: branchIds }, tenantId: req.user.tenantId } });
            if (validBranches !== branchIds.length)
                throw new errors_1.ValidationError("One or more branchIds are invalid for this tenant");
        }
        const passwordHash = await (0, password_1.hashPassword)(password);
        const { username: explicitUsername, ...restWithoutUsername } = rest;
        const createUser = (username) => prisma_1.prisma.user.create({
            data: {
                ...restWithoutUsername,
                username,
                tenantId: req.user.tenantId,
                passwordHash,
                userBranches: { create: branchIds.map((branchId) => ({ branchId })) },
            },
            select: userSummarySelect,
        });
        // A caller-supplied username was already uniqueness-checked above (good enough for a
        // manual admin choice); an auto-generated one retries end-to-end on a race, same reasoning
        // as withUniqueUsername's own comment.
        const user = explicitUsername ? await createUser(explicitUsername) : await (0, username_1.withUniqueUsername)(prisma_1.prisma, rest.name, "user", createUser);
        (0, audit_1.recordAudit)({ req, module: "users", action: "create", entityType: "User", entityId: user.id, newValue: { email: user.email, role: role.name } });
        (0, notify_1.notify)({ tenantId: req.user.tenantId, type: "user_created", title: "New user added", message: `${user.name} was added as ${role.name}` });
        res.status(201).json({ data: user });
    }
    catch (err) {
        next(err);
    }
});
exports.usersRouter.put("/:id", (0, auth_1.requirePermission)("users", "edit"), (0, validate_1.validateBody)(users_validation_1.updateUserSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId, deletedAt: null } });
        if (!existing)
            throw new errors_1.NotFoundError("User not found");
        const { branchIds, ...rest } = req.body;
        if (rest.roleId) {
            if (existing.id === req.user.id)
                throw new errors_1.ValidationError("You cannot change your own role");
            await assertCanAssignRole(req, rest.roleId);
        }
        if (rest.username) {
            const existingUsername = await prisma_1.prisma.user.findUnique({ where: { username: rest.username } });
            if (existingUsername && existingUsername.id !== existing.id)
                throw new errors_1.ConflictError("This username is already taken");
        }
        const user = await prisma_1.prisma.$transaction(async (tx) => {
            if (branchIds) {
                const validBranches = await tx.branch.count({ where: { id: { in: branchIds }, tenantId: req.user.tenantId } });
                if (validBranches !== branchIds.length)
                    throw new errors_1.ValidationError("One or more branchIds are invalid for this tenant");
                await tx.userBranch.deleteMany({ where: { userId: existing.id } });
                if (branchIds.length > 0) {
                    await tx.userBranch.createMany({ data: branchIds.map((branchId) => ({ userId: existing.id, branchId })) });
                }
            }
            return tx.user.update({ where: { id: existing.id }, data: rest, select: userSummarySelect });
        });
        (0, audit_1.recordAudit)({ req, module: "users", action: "update", entityType: "User", entityId: user.id, oldValue: existing, newValue: user });
        res.json({ data: user });
    }
    catch (err) {
        next(err);
    }
});
exports.usersRouter.delete("/:id", (0, auth_1.requirePermission)("users", "delete"), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId, deletedAt: null } });
        if (!existing)
            throw new errors_1.NotFoundError("User not found");
        if (existing.id === req.user.id)
            throw new errors_1.ValidationError("You cannot delete your own account");
        const user = await prisma_1.prisma.user.update({ where: { id: existing.id }, data: { isActive: false, deletedAt: new Date() } });
        (0, audit_1.recordAudit)({ req, module: "users", action: "delete", entityType: "User", entityId: user.id, oldValue: existing });
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
exports.usersRouter.post("/me/change-password", (0, validate_1.validateBody)(users_validation_1.changePasswordSchema), async (req, res, next) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user)
            throw new errors_1.NotFoundError("User not found");
        const valid = await (0, password_1.verifyPassword)(req.body.currentPassword, user.passwordHash);
        if (!valid)
            throw new errors_1.UnauthorizedError("Current password is incorrect");
        const passwordHash = await (0, password_1.hashPassword)(req.body.newPassword);
        await prisma_1.prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
        // Force re-login everywhere else after a password change.
        await prisma_1.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
        (0, audit_1.recordAudit)({ req, module: "users", action: "change_password", entityType: "User", entityId: user.id });
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
