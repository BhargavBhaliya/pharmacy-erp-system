// One-time backfill: "purchase.cancel" was just added to the permission catalog (it existed in
// the global PERMISSION_ACTIONS list and the cancel route already required it, but was missing
// from the `purchase` module's MODULE_ACTIONS — meaning no role, in any tenant, including
// Super Admin's "*.*" wildcard, could ever have actually held it; the cancel-PO route was dead
// for everyone). ensureGlobalPermissions() creates the new Permission row; this script then
// grants it to any role that already holds the full set of the OTHER purchase.* permissions —
// that combination is only produced by a "purchase.*"-equivalent wildcard grant (see
// DEFAULT_ROLE_PERMISSION_GRANTS and expandPermissionGrants in packages/shared/src/rbac.ts), so
// it's a reliable signal the role was meant to have every purchase action, this one included.
// Run from apps/api: npx tsx prisma/backfill-purchase-cancel-permission.ts
import { prisma } from "../src/lib/prisma";
import { ensureGlobalPermissions } from "../src/lib/permissionsCatalog";

const FULL_ACCESS_MARKER_CODES = ["purchase.view", "purchase.add", "purchase.edit", "purchase.delete", "purchase.approve", "purchase.export", "purchase.print"];

async function main() {
  await ensureGlobalPermissions();

  const cancelPermission = await prisma.permission.findUniqueOrThrow({ where: { code: "purchase.cancel" } });
  const markerPermissions = await prisma.permission.findMany({ where: { code: { in: FULL_ACCESS_MARKER_CODES } } });
  if (markerPermissions.length !== FULL_ACCESS_MARKER_CODES.length) {
    throw new Error("Expected marker permissions missing from catalog — aborting.");
  }
  const markerIds = new Set(markerPermissions.map((p) => p.id));

  const roles = await prisma.role.findMany({
    include: { rolePermissions: { where: { allowed: true }, select: { permissionId: true } } },
  });

  let grantedCount = 0;
  const writes: { roleId: string; roleName: string; tenantId: string }[] = [];
  for (const role of roles) {
    const heldIds = new Set(role.rolePermissions.map((rp) => rp.permissionId));
    const hasFullPurchaseAccess = [...markerIds].every((id) => heldIds.has(id));
    const alreadyHasCancel = heldIds.has(cancelPermission.id);
    if (hasFullPurchaseAccess && !alreadyHasCancel) {
      writes.push({ roleId: role.id, roleName: role.name, tenantId: role.tenantId });
    }
  }

  if (writes.length > 0) {
    await prisma.rolePermission.createMany({
      data: writes.map((w) => ({ roleId: w.roleId, permissionId: cancelPermission.id, allowed: true })),
      skipDuplicates: true,
    });
    grantedCount = writes.length;
  }

  console.log(`Granted purchase.cancel to ${grantedCount} existing role(s):`);
  for (const w of writes) console.log(`  ${w.roleName} (tenant ${w.tenantId})`);
  await prisma.$disconnect();
}

main();
