"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
exports.auditRouter = (0, express_1.Router)();
exports.auditRouter.use(auth_1.authenticate);
const querySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(200).default(50),
    module: zod_1.z.string().optional(),
    entityType: zod_1.z.string().optional(),
    userId: zod_1.z.string().optional(),
});
exports.auditRouter.get("/", (0, auth_1.requirePermission)("audit_logs", "view"), async (req, res, next) => {
    try {
        const q = querySchema.parse(req.query);
        const where = {
            tenantId: req.user.tenantId,
            ...(q.module ? { module: q.module } : {}),
            ...(q.entityType ? { entityType: q.entityType } : {}),
            ...(q.userId ? { userId: q.userId } : {}),
        };
        const [total, data] = await Promise.all([
            prisma_1.prisma.auditLog.count({ where }),
            prisma_1.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (q.page - 1) * q.pageSize,
                take: q.pageSize,
                include: { user: { select: { id: true, name: true, email: true } } },
            }),
        ]);
        res.json({ data, pagination: { page: q.page, pageSize: q.pageSize, total } });
    }
    catch (err) {
        next(err);
    }
});
