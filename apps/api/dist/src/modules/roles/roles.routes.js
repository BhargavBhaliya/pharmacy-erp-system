"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rolesRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const roles_validation_1 = require("./roles.validation");
exports.rolesRouter = (0, express_1.Router)();
exports.rolesRouter.use(auth_1.authenticate);
// A role editor must not be able to grant a permission they don't themselves hold — otherwise
// anyone with roles.edit + users.edit could mint a role with "*.*" and assign it to themselves,
// escaping whatever restricted role they were actually given.
function assertNotEscalating(req, permissionCodes) {
    const notHeld = permissionCodes.filter((code) => !req.user.permissionCodes.has(code));
    if (notHeld.length > 0) {
        throw new errors_1.ForbiddenError(`You cannot grant permissions you don't have: ${notHeld.join(", ")}`);
    }
}
// Full catalog of assignable (module, action) permissions, for rendering a permission matrix UI.
exports.rolesRouter.get("/catalog", (0, auth_1.requirePermission)("roles", "view"), async (_req, res, next) => {
    try {
        const permissions = await prisma_1.prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] });
        res.json({ data: permissions });
    }
    catch (err) {
        next(err);
    }
});
exports.rolesRouter.get("/", (0, auth_1.requirePermission)("roles", "view"), async (req, res, next) => {
    try {
        const roles = await prisma_1.prisma.role.findMany({
            where: { tenantId: req.user.tenantId },
            include: { rolePermissions: { include: { permission: true } }, _count: { select: { users: true } } },
            orderBy: { name: "asc" },
        });
        res.json({
            data: roles.map((r) => ({
                id: r.id,
                name: r.name,
                isSystem: r.isSystem,
                discountLimitPercent: r.discountLimitPercent,
                userCount: r._count.users,
                permissionCodes: r.rolePermissions.filter((rp) => rp.allowed).map((rp) => rp.permission.code),
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
exports.rolesRouter.post("/", (0, auth_1.requirePermission)("roles", "add"), (0, validate_1.validateBody)(roles_validation_1.createRoleSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.role.findFirst({ where: { tenantId: req.user.tenantId, name: req.body.name } });
        if (existing)
            throw new errors_1.ConflictError("A role with this name already exists");
        if (req.body.discountLimitPercent > req.user.discountLimitPercent) {
            throw new errors_1.ForbiddenError(`You cannot set a discount limit higher than your own (${req.user.discountLimitPercent}%)`);
        }
        assertNotEscalating(req, req.body.permissionCodes);
        const permissions = await prisma_1.prisma.permission.findMany({ where: { code: { in: req.body.permissionCodes } } });
        const role = await prisma_1.prisma.role.create({
            data: {
                tenantId: req.user.tenantId,
                name: req.body.name,
                discountLimitPercent: req.body.discountLimitPercent,
                rolePermissions: {
                    create: permissions.map((p) => ({ permissionId: p.id, allowed: true })),
                },
            },
            include: { rolePermissions: { include: { permission: true } } },
        });
        (0, audit_1.recordAudit)({ req, module: "roles", action: "create", entityType: "Role", entityId: role.id, newValue: { name: role.name } });
        res.status(201).json({ data: role });
    }
    catch (err) {
        next(err);
    }
});
exports.rolesRouter.put("/:id", (0, auth_1.requirePermission)("roles", "edit"), (0, validate_1.validateBody)(roles_validation_1.updateRoleSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.role.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Role not found");
        if (req.body.discountLimitPercent !== undefined && req.body.discountLimitPercent > req.user.discountLimitPercent) {
            throw new errors_1.ForbiddenError(`You cannot set a discount limit higher than your own (${req.user.discountLimitPercent}%)`);
        }
        const role = await prisma_1.prisma.role.update({ where: { id: existing.id }, data: req.body });
        (0, audit_1.recordAudit)({ req, module: "roles", action: "update", entityType: "Role", entityId: role.id, oldValue: existing, newValue: role });
        res.json({ data: role });
    }
    catch (err) {
        next(err);
    }
});
// Full replace of a role's permission set — simplest mental model for an admin-facing checkbox UI.
exports.rolesRouter.put("/:id/permissions", (0, auth_1.requirePermission)("roles", "edit"), (0, validate_1.validateBody)(roles_validation_1.updateRolePermissionsSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.role.findFirst({
            where: { id: req.params.id, tenantId: req.user.tenantId },
            include: { rolePermissions: { include: { permission: true } } },
        });
        if (!existing)
            throw new errors_1.NotFoundError("Role not found");
        assertNotEscalating(req, req.body.permissionCodes);
        const permissions = await prisma_1.prisma.permission.findMany({ where: { code: { in: req.body.permissionCodes } } });
        if (permissions.length !== req.body.permissionCodes.length) {
            throw new errors_1.ValidationError("One or more permission codes are invalid");
        }
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.rolePermission.deleteMany({ where: { roleId: existing.id } }),
            prisma_1.prisma.rolePermission.createMany({
                data: permissions.map((p) => ({ roleId: existing.id, permissionId: p.id, allowed: true })),
            }),
        ]);
        (0, audit_1.recordAudit)({
            req,
            module: "roles",
            action: "update_permissions",
            entityType: "Role",
            entityId: existing.id,
            oldValue: existing.rolePermissions.map((rp) => rp.permission.code),
            newValue: req.body.permissionCodes,
        });
        res.json({ data: { id: existing.id, permissionCodes: req.body.permissionCodes } });
    }
    catch (err) {
        next(err);
    }
});
exports.rolesRouter.delete("/:id", (0, auth_1.requirePermission)("roles", "delete"), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.role.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Role not found");
        if (existing.isSystem)
            throw new errors_1.ValidationError("Default system roles cannot be deleted");
        const usersWithRole = await prisma_1.prisma.user.count({ where: { roleId: existing.id } });
        if (usersWithRole > 0)
            throw new errors_1.ConflictError("Cannot delete a role that is still assigned to users");
        await prisma_1.prisma.role.delete({ where: { id: existing.id } });
        (0, audit_1.recordAudit)({ req, module: "roles", action: "delete", entityType: "Role", entityId: existing.id, oldValue: existing });
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
