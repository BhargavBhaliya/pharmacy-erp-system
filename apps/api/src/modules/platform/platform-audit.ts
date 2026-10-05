import type { Request } from "express";
import { prisma } from "../../lib/prisma";

interface PlatformAuditParams {
  req: Request;
  tenantId: string;
  action: string;
  entityType: string;
  entityId: string;
  newValue?: unknown;
}

// Writes into the TARGET TENANT's own AuditLog (module: "platform_admin", userId: null) so
// every cross-tenant admin action — impersonation especially — shows up on that store's own
// Audit Logs page. Never silent. Mirrors lib/audit.ts's fire-and-forget shape, but the caller
// is a PlatformAdmin (req.platformAdmin), not a tenant user, hence the explicit tenantId param.
export function recordPlatformAudit({ req, tenantId, action, entityType, entityId, newValue }: PlatformAuditParams): void {
  const admin = req.platformAdmin;
  if (!admin) return;

  prisma.auditLog
    .create({
      data: {
        tenantId,
        userId: null,
        module: "platform_admin",
        action,
        entityType,
        entityId,
        newValue: { platformAdminId: admin.id, platformAdminEmail: admin.email, ...(newValue && typeof newValue === "object" ? newValue : {}) },
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      },
    })
    .catch((err) => {
      console.error("Failed to write platform audit log", err);
    });
}
