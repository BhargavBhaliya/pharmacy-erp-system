import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../lib/jwt";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";

// Roles that can see/operate across every branch in the tenant without an explicit
// UserBranch row, per spec section 3 ("Owner/Admin can view all branches").
const TENANT_WIDE_ROLE_NAMES = new Set(["Super Admin", "Business Owner"]);

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing bearer token");
    }
    const token = header.slice("Bearer ".length);
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tenantId, deletedAt: null },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
        userBranches: { select: { branchId: true } },
        tenant: { select: { isActive: true } },
      },
    });

    if (!user || !user.isActive || !user.tenant.isActive) {
      throw new UnauthorizedError("Account is inactive or no longer exists");
    }

    const permissionCodes = new Set(
      user.role.rolePermissions.filter((rp) => rp.allowed).map((rp) => rp.permission.code)
    );

    let branchIds = user.userBranches.map((ub) => ub.branchId);
    if (TENANT_WIDE_ROLE_NAMES.has(user.role.name)) {
      const allBranches = await prisma.branch.findMany({
        where: { tenantId: user.tenantId },
        select: { id: true },
      });
      branchIds = allBranches.map((b) => b.id);
    }

    req.user = {
      id: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      email: user.email,
      name: user.name,
      branchIds,
      permissionCodes,
      discountLimitPercent: Number(user.role.discountLimitPercent),
    };

    next();
  } catch (err) {
    next(err instanceof Error && !(err instanceof UnauthorizedError) ? new UnauthorizedError() : err);
  }
}

export function requirePermission(module: string, action: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    const code = `${module}.${action}`;
    if (!req.user.permissionCodes.has(code)) {
      return next(new ForbiddenError(`Missing permission: ${code}`));
    }
    next();
  };
}

// Checks a branchId supplied via req.params.branchId, req.body.branchId, or req.query.branchId
// (first one found wins) against the caller's assigned branches. Must run after authenticate().
export function requireBranchAccess(paramName = "branchId") {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    const branchId =
      req.params[paramName] ?? req.body?.[paramName] ?? (req.query[paramName] as string | undefined);

    if (!branchId) return next(); // route doesn't scope by branch; nothing to check
    if (!req.user.branchIds.includes(branchId)) {
      return next(new ForbiddenError("You do not have access to this branch"));
    }
    next();
  };
}
