"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requirePermission = requirePermission;
exports.requireBranchAccess = requireBranchAccess;
const prisma_1 = require("../lib/prisma");
const jwt_1 = require("../lib/jwt");
const errors_1 = require("../lib/errors");
// Roles that can see/operate across every branch in the tenant without an explicit
// UserBranch row, per spec section 3 ("Owner/Admin can view all branches").
const TENANT_WIDE_ROLE_NAMES = new Set(["Super Admin", "Business Owner"]);
async function authenticate(req, _res, next) {
    try {
        const header = req.headers.authorization;
        if (!header?.startsWith("Bearer ")) {
            throw new errors_1.UnauthorizedError("Missing bearer token");
        }
        const token = header.slice("Bearer ".length);
        const payload = (0, jwt_1.verifyAccessToken)(token);
        const user = await prisma_1.prisma.user.findFirst({
            where: { id: payload.sub, tenantId: payload.tenantId, deletedAt: null },
            include: {
                role: { include: { rolePermissions: { include: { permission: true } } } },
                userBranches: { select: { branchId: true } },
                tenant: { select: { isActive: true } },
            },
        });
        if (!user || !user.isActive || !user.tenant.isActive) {
            throw new errors_1.UnauthorizedError("Account is inactive or no longer exists");
        }
        const permissionCodes = new Set(user.role.rolePermissions.filter((rp) => rp.allowed).map((rp) => rp.permission.code));
        let branchIds = user.userBranches.map((ub) => ub.branchId);
        if (TENANT_WIDE_ROLE_NAMES.has(user.role.name)) {
            const allBranches = await prisma_1.prisma.branch.findMany({
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
            username: user.username,
            name: user.name,
            branchIds,
            permissionCodes,
            discountLimitPercent: Number(user.role.discountLimitPercent),
        };
        next();
    }
    catch (err) {
        next(err instanceof Error && !(err instanceof errors_1.UnauthorizedError) ? new errors_1.UnauthorizedError() : err);
    }
}
function requirePermission(module, action) {
    return (req, _res, next) => {
        if (!req.user)
            return next(new errors_1.UnauthorizedError());
        const code = `${module}.${action}`;
        if (!req.user.permissionCodes.has(code)) {
            return next(new errors_1.ForbiddenError(`Missing permission: ${code}`));
        }
        next();
    };
}
// Checks a branchId supplied via req.params.branchId, req.body.branchId, or req.query.branchId
// (first one found wins) against the caller's assigned branches. Must run after authenticate().
function requireBranchAccess(paramName = "branchId") {
    return (req, _res, next) => {
        if (!req.user)
            return next(new errors_1.UnauthorizedError());
        const branchId = req.params[paramName] ?? req.body?.[paramName] ?? req.query[paramName];
        if (!branchId)
            return next(); // route doesn't scope by branch; nothing to check
        if (!req.user.branchIds.includes(branchId)) {
            return next(new errors_1.ForbiddenError("You do not have access to this branch"));
        }
        next();
    };
}
