"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordPlatformAudit = recordPlatformAudit;
const prisma_1 = require("../../lib/prisma");
// Writes into the TARGET TENANT's own AuditLog (module: "platform_admin", userId: null) so
// every cross-tenant admin action — impersonation especially — shows up on that store's own
// Audit Logs page. Never silent. Mirrors lib/audit.ts's fire-and-forget shape, but the caller
// is a PlatformAdmin (req.platformAdmin), not a tenant user, hence the explicit tenantId param.
function recordPlatformAudit({ req, tenantId, action, entityType, entityId, newValue }) {
    const admin = req.platformAdmin;
    if (!admin)
        return;
    prisma_1.prisma.auditLog
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
