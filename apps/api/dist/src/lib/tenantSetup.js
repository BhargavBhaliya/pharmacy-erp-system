"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDefaultRolesForTenant = seedDefaultRolesForTenant;
const shared_1 = require("@pharmacy-erp/shared");
const prisma_1 = require("./prisma");
const permissionsCatalog_1 = require("./permissionsCatalog");
// Creates the full default role set (with permissions pre-wired) for a brand-new tenant.
// Called once at tenant registration; admins can edit/add roles afterwards via the roles API.
// Accepts an optional transaction client so callers can run this inside the same transaction
// that creates the tenant row (a separate connection wouldn't see the uncommitted tenant yet).
async function seedDefaultRolesForTenant(tenantId, db = prisma_1.prisma) {
    await (0, permissionsCatalog_1.ensureGlobalPermissions)(db);
    const allPermissions = await db.permission.findMany();
    const permissionIdByCode = new Map(allPermissions.map((p) => [p.code, p.id]));
    const roleIdByName = new Map();
    for (const roleName of shared_1.DEFAULT_ROLES) {
        const role = await db.role.create({
            data: {
                tenantId,
                name: roleName,
                isSystem: true,
                discountLimitPercent: shared_1.DEFAULT_DISCOUNT_LIMIT_PERCENT[roleName] ?? 0,
            },
        });
        roleIdByName.set(roleName, role.id);
        const codes = (0, shared_1.expandPermissionGrants)(shared_1.DEFAULT_ROLE_PERMISSION_GRANTS[roleName]);
        const data = codes
            .map((code) => permissionIdByCode.get(code))
            .filter((id) => Boolean(id))
            .map((permissionId) => ({ roleId: role.id, permissionId, allowed: true }));
        if (data.length > 0) {
            await db.rolePermission.createMany({ data, skipDuplicates: true });
        }
    }
    return roleIdByName;
}
