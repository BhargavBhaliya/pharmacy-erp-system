import crypto from "node:crypto";
import { prisma } from "../src/lib/prisma";

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${crypto.randomBytes(6).toString("hex")}@test.local`;
}

export async function deleteTenant(tenantId: string): Promise<void> {
  // Cascades to branches/users/roles/audit logs/etc per schema onDelete: Cascade.
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
}
