import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { hashPassword, verifyPassword } from "../../lib/password";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { changePasswordSchema, createUserSchema, updateUserSchema } from "./users.validation";

export const usersRouter = Router();
usersRouter.use(authenticate);

const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
  userBranches: { select: { branch: { select: { id: true, name: true } } } },
} as const;

usersRouter.get("/", requirePermission("users", "view"), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId, deletedAt: null },
      select: userSummarySelect,
      orderBy: { name: "asc" },
    });
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/", requirePermission("users", "add"), validateBody(createUserSchema), async (req, res, next) => {
  try {
    const { branchIds, password, ...rest } = req.body as typeof req.body & { password: string };

    const existing = await prisma.user.findUnique({ where: { email: rest.email } });
    if (existing) throw new ConflictError("An account with this email already exists");

    const role = await prisma.role.findFirst({ where: { id: rest.roleId, tenantId: req.user!.tenantId } });
    if (!role) throw new ValidationError("Invalid roleId for this tenant");

    if (branchIds.length > 0) {
      const validBranches = await prisma.branch.count({ where: { id: { in: branchIds }, tenantId: req.user!.tenantId } });
      if (validBranches !== branchIds.length) throw new ValidationError("One or more branchIds are invalid for this tenant");
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        ...rest,
        tenantId: req.user!.tenantId,
        passwordHash,
        userBranches: { create: branchIds.map((branchId: string) => ({ branchId })) },
      },
      select: userSummarySelect,
    });

    recordAudit({ req, module: "users", action: "create", entityType: "User", entityId: user.id, newValue: { email: user.email, role: role.name } });
    res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
});

usersRouter.put("/:id", requirePermission("users", "edit"), validateBody(updateUserSchema), async (req, res, next) => {
  try {
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundError("User not found");

    const { branchIds, ...rest } = req.body as typeof req.body;

    if (rest.roleId) {
      const role = await prisma.role.findFirst({ where: { id: rest.roleId, tenantId: req.user!.tenantId } });
      if (!role) throw new ValidationError("Invalid roleId for this tenant");
    }

    const user = await prisma.$transaction(async (tx) => {
      if (branchIds) {
        const validBranches = await tx.branch.count({ where: { id: { in: branchIds }, tenantId: req.user!.tenantId } });
        if (validBranches !== branchIds.length) throw new ValidationError("One or more branchIds are invalid for this tenant");
        await tx.userBranch.deleteMany({ where: { userId: existing.id } });
        if (branchIds.length > 0) {
          await tx.userBranch.createMany({ data: branchIds.map((branchId: string) => ({ userId: existing.id, branchId })) });
        }
      }
      return tx.user.update({ where: { id: existing.id }, data: rest, select: userSummarySelect });
    });

    recordAudit({ req, module: "users", action: "update", entityType: "User", entityId: user.id, oldValue: existing, newValue: user });
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

usersRouter.delete("/:id", requirePermission("users", "delete"), async (req, res, next) => {
  try {
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId, deletedAt: null } });
    if (!existing) throw new NotFoundError("User not found");
    if (existing.id === req.user!.id) throw new ValidationError("You cannot delete your own account");

    const user = await prisma.user.update({ where: { id: existing.id }, data: { isActive: false, deletedAt: new Date() } });
    recordAudit({ req, module: "users", action: "delete", entityType: "User", entityId: user.id, oldValue: existing });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/me/change-password", validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new NotFoundError("User not found");

    const valid = await verifyPassword(req.body.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedError("Current password is incorrect");

    const passwordHash = await hashPassword(req.body.newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
    // Force re-login everywhere else after a password change.
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });

    recordAudit({ req, module: "users", action: "change_password", entityType: "User", entityId: user.id });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
