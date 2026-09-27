import type { Request } from "express";
import { prisma } from "./prisma";

interface AuditParams {
  req: Request;
  module: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  branchId?: string | null;
}

// Fire-and-forget by design: an audit-log failure must never block the business operation
// that triggered it, but we do log to stderr so it isn't silently lost (spec section 28).
export function recordAudit({
  req,
  module,
  action,
  entityType,
  entityId,
  oldValue,
  newValue,
  branchId,
}: AuditParams): void {
  const user = req.user;
  if (!user) return;

  prisma.auditLog
    .create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        branchId: branchId ?? null,
        module,
        action,
        entityType,
        entityId,
        oldValue: oldValue === undefined ? undefined : (oldValue as object),
        newValue: newValue === undefined ? undefined : (newValue as object),
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      },
    })
    .catch((err) => {
      console.error("Failed to write audit log", err);
    });
}
