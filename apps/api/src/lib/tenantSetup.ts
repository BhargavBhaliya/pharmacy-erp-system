import {
  DEFAULT_DISCOUNT_LIMIT_PERCENT,
  DEFAULT_ROLES,
  DEFAULT_ROLE_PERMISSION_GRANTS,
  expandPermissionGrants,
  type DefaultRoleName,
} from "@pharmacy-erp/shared";
import { prisma } from "./prisma";
import { ensureGlobalPermissions, type Db } from "./permissionsCatalog";

// Creates the full default role set (with permissions pre-wired) for a brand-new tenant.
// Called once at tenant registration; admins can edit/add roles afterwards via the roles API.
// Accepts an optional transaction client so callers can run this inside the same transaction
// that creates the tenant row (a separate connection wouldn't see the uncommitted tenant yet).
export async function seedDefaultRolesForTenant(
  tenantId: string,
  db: Db = prisma
): Promise<Map<DefaultRoleName, string>> {
  await ensureGlobalPermissions(db);

  const allPermissions = await db.permission.findMany();
  const permissionIdByCode = new Map(allPermissions.map((p) => [p.code, p.id]));

  const roleIdByName = new Map<DefaultRoleName, string>();

  for (const roleName of DEFAULT_ROLES) {
    const role = await db.role.create({
      data: {
        tenantId,
        name: roleName,
        isSystem: true,
        discountLimitPercent: DEFAULT_DISCOUNT_LIMIT_PERCENT[roleName] ?? 0,
      },
    });
    roleIdByName.set(roleName, role.id);

    const codes = expandPermissionGrants(DEFAULT_ROLE_PERMISSION_GRANTS[roleName]);
    const data = codes
      .map((code) => permissionIdByCode.get(code))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId: role.id, permissionId, allowed: true }));

    if (data.length > 0) {
      await db.rolePermission.createMany({ data, skipDuplicates: true });
    }
  }

  return roleIdByName;
}
