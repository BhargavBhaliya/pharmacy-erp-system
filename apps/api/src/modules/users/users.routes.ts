import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { hashPassword, verifyPassword } from "../../lib/password";
import { withUniqueUsername } from "../../lib/username";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { notify } from "../../lib/notify";
import { changePasswordSchema, createUserSchema, updateUserSchema } from "./users.validation";

export const usersRouter = Router();
usersRouter.use(authenticate);

// A user with users.edit must not be able to assign a role carrying permissions they don't
// themselves hold — otherwise any user-management role could mint itself (or an accomplice
// account) full admin access via a role that happens to be more powerful than its own.
async function assertCanAssignRole(req: import("express").Request, roleId: string) {
  const role = await prisma.role.findFirst({
    where: { id: roleId, tenantId: req.user!.tenantId },
    include: { rolePermissions: { include: { permission: true }, where: { allowed: true } } },
  });
  if (!role) throw new ValidationError("Invalid roleId for this tenant");

  const notHeld = role.rolePermissions.map((rp) => rp.permission.code).filter((code) => !req.user!.permissionCodes.has(code));
  if (notHeld.length > 0) {
    throw new ForbiddenError(`You cannot assign a role with permissions you don't have: ${notHeld.join(", ")}`);
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

    if (rest.username) {
      const existingUsername = await prisma.user.findUnique({ where: { username: rest.username } });
      if (existingUsername) throw new ConflictError("This username is already taken");
    }

    const role = await assertCanAssignRole(req, rest.roleId);

    if (branchIds.length > 0) {
      const validBranches = await prisma.branch.count({ where: { id: { in: branchIds }, tenantId: req.user!.tenantId } });
      if (validBranches !== branchIds.length) throw new ValidationError("One or more branchIds are invalid for this tenant");
    }

    const passwordHash = await hashPassword(password);
    const { username: explicitUsername, ...restWithoutUsername } = rest;
    const createUser = (username: string) =>
      prisma.user.create({
        data: {
          ...restWithoutUsername,
          username,
          tenantId: req.user!.tenantId,
          passwordHash,
          userBranches: { create: branchIds.map((branchId: string) => ({ branchId })) },
        },
        select: userSummarySelect,
      });
    // A caller-supplied username was already uniqueness-checked above (good enough for a
    // manual admin choice); an auto-generated one retries end-to-end on a race, same reasoning
    // as withUniqueUsername's own comment.
    const user = explicitUsername ? await createUser(explicitUsername) : await withUniqueUsername(prisma, rest.name, "user", createUser);

    recordAudit({ req, module: "users", action: "create", entityType: "User", entityId: user.id, newValue: { email: user.email, role: role.name } });
    notify({ tenantId: req.user!.tenantId, type: "user_created", title: "New user added", message: `${user.name} was added as ${role.name}` });
    res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
});

usersRouter.put("/:id", requirePermission("users", "edit"), validateBody(updateUserSchema), async (req, res, next) => {
  try {
    // select excludes passwordHash — this snapshot gets persisted verbatim as audit-log
    // oldValue, which is readable by anyone with just the audit_logs.view permission.
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId, deletedAt: null }, select: userSummarySelect });
    if (!existing) throw new NotFoundError("User not found");

    const { branchIds, ...rest } = req.body as typeof req.body;

    if (rest.roleId) {
      if (existing.id === req.user!.id) throw new ValidationError("You cannot change your own role");
      await assertCanAssignRole(req, rest.roleId);
    }

    if (rest.username) {
      const existingUsername = await prisma.user.findUnique({ where: { username: rest.username } });
      if (existingUsername && existingUsername.id !== existing.id) throw new ConflictError("This username is already taken");
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
    // select excludes passwordHash — see the matching comment on PUT /:id above.
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId, deletedAt: null }, select: userSummarySelect });
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
