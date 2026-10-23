import crypto from "node:crypto";
import { prisma } from "../src/lib/prisma";

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${crypto.randomBytes(6).toString("hex")}@test.local`;
}

export function uniqueUsername(prefix: string): string {
  return `${prefix}${crypto.randomBytes(4).toString("hex")}`;
}

export async function deleteTenant(tenantId: string): Promise<void> {
  // MySQL (unlike Postgres) doesn't reliably order multi-path cascades: when Tenant cascades
  // down two independent paths that reconverge on the same table via a required, non-cascade
  // relation, InnoDB can process the paths in an order that violates the FK before both finish.
  // Delete the "reconverging" side of each such pair first so nothing is left pointing at a row
  // by the time Tenant's own cascade reaches it:
  //   User.roleId -> Role        (also reached directly via Tenant -> Role)
  //   SalesReturnItem.saleItemId -> SaleItem (also reached via Tenant -> Sale -> SaleItem)
  await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
  await prisma.salesReturn.deleteMany({ where: { tenantId } }).catch(() => undefined);
  // Cascades to branches/roles/audit logs/etc per schema onDelete: Cascade.
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
}
