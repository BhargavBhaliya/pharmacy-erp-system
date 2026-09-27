import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { createRoleSchema, updateRolePermissionsSchema, updateRoleSchema } from "./roles.validation";

export const rolesRouter = Router();
rolesRouter.use(authenticate);

// Full catalog of assignable (module, action) permissions, for rendering a permission matrix UI.
rolesRouter.get("/catalog", requirePermission("roles", "view"), async (_req, res, next) => {
  try {
    const permissions = await prisma.permission.findMany({ orderBy: [{ module: "asc" }, { action: "asc" }] });
    res.json({ data: permissions });
  } catch (err) {
    next(err);
  }
});

rolesRouter.get("/", requirePermission("roles", "view"), async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      where: { tenantId: req.user!.tenantId },
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
  } catch (err) {
    next(err);
  }
});

rolesRouter.post("/", requirePermission("roles", "add"), validateBody(createRoleSchema), async (req, res, next) => {
  try {
    const existing = await prisma.role.findFirst({ where: { tenantId: req.user!.tenantId, name: req.body.name } });
    if (existing) throw new ConflictError("A role with this name already exists");

    const permissions = await prisma.permission.findMany({ where: { code: { in: req.body.permissionCodes } } });

    const role = await prisma.role.create({
      data: {
        tenantId: req.user!.tenantId,
        name: req.body.name,
        discountLimitPercent: req.body.discountLimitPercent,
        rolePermissions: {
          create: permissions.map((p) => ({ permissionId: p.id, allowed: true })),
        },
      },
      include: { rolePermissions: { include: { permission: true } } },
    });

    recordAudit({ req, module: "roles", action: "create", entityType: "Role", entityId: role.id, newValue: { name: role.name } });
    res.status(201).json({ data: role });
  } catch (err) {
    next(err);
  }
});

rolesRouter.put("/:id", requirePermission("roles", "edit"), validateBody(updateRoleSchema), async (req, res, next) => {
  try {
    const existing = await prisma.role.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Role not found");

    const role = await prisma.role.update({ where: { id: existing.id }, data: req.body });
    recordAudit({ req, module: "roles", action: "update", entityType: "Role", entityId: role.id, oldValue: existing, newValue: role });
    res.json({ data: role });
  } catch (err) {
    next(err);
  }
});

// Full replace of a role's permission set — simplest mental model for an admin-facing checkbox UI.
rolesRouter.put(
  "/:id/permissions",
  requirePermission("roles", "edit"),
  validateBody(updateRolePermissionsSchema),
  async (req, res, next) => {
    try {
      const existing = await prisma.role.findFirst({
        where: { id: req.params.id, tenantId: req.user!.tenantId },
        include: { rolePermissions: { include: { permission: true } } },
      });
      if (!existing) throw new NotFoundError("Role not found");

      const permissions = await prisma.permission.findMany({ where: { code: { in: req.body.permissionCodes } } });
      if (permissions.length !== req.body.permissionCodes.length) {
        throw new ValidationError("One or more permission codes are invalid");
      }

      await prisma.$transaction([
        prisma.rolePermission.deleteMany({ where: { roleId: existing.id } }),
        prisma.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: existing.id, permissionId: p.id, allowed: true })),
        }),
      ]);

      recordAudit({
        req,
        module: "roles",
        action: "update_permissions",
        entityType: "Role",
        entityId: existing.id,
        oldValue: existing.rolePermissions.map((rp) => rp.permission.code),
        newValue: req.body.permissionCodes,
      });

      res.json({ data: { id: existing.id, permissionCodes: req.body.permissionCodes } });
    } catch (err) {
      next(err);
    }
  }
);

rolesRouter.delete("/:id", requirePermission("roles", "delete"), async (req, res, next) => {
  try {
    const existing = await prisma.role.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Role not found");
    if (existing.isSystem) throw new ValidationError("Default system roles cannot be deleted");

    const usersWithRole = await prisma.user.count({ where: { roleId: existing.id } });
    if (usersWithRole > 0) throw new ConflictError("Cannot delete a role that is still assigned to users");

    await prisma.role.delete({ where: { id: existing.id } });
    recordAudit({ req, module: "roles", action: "delete", entityType: "Role", entityId: existing.id, oldValue: existing });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
