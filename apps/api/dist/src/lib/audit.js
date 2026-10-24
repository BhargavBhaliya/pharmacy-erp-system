"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAudit = recordAudit;
const prisma_1 = require("./prisma");
// Fire-and-forget by design: an audit-log failure must never block the business operation
// that triggered it, but we do log to stderr so it isn't silently lost (spec section 28).
function recordAudit({ req, module, action, entityType, entityId, oldValue, newValue, branchId, }) {
    const user = req.user;
    if (!user)
        return;
    prisma_1.prisma.auditLog
        .create({
        data: {
            tenantId: user.tenantId,
            userId: user.id,
            branchId: branchId ?? null,
            module,
            action,
            entityType,
            entityId,
            oldValue: oldValue === undefined ? undefined : oldValue,
            newValue: newValue === undefined ? undefined : newValue,
            ipAddress: req.ip,
            userAgent: req.get("user-agent") ?? undefined,
        },
    })
        .catch((err) => {
        console.error("Failed to write audit log", err);
    });
}
