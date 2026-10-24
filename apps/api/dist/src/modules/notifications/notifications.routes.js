"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const errors_1 = require("../../lib/errors");
exports.notificationsRouter = (0, express_1.Router)();
exports.notificationsRouter.use(auth_1.authenticate);
const listQuery = zod_1.z.object({
    unreadOnly: zod_1.z.coerce.boolean().default(false),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(30),
});
exports.notificationsRouter.get("/", (0, auth_1.requirePermission)("notifications", "view"), async (req, res, next) => {
    try {
        const q = listQuery.parse(req.query);
        const where = { tenantId: req.user.tenantId, ...(q.unreadOnly ? { isRead: false } : {}) };
        const [total, unreadCount, data] = await Promise.all([
            prisma_1.prisma.notification.count({ where }),
            prisma_1.prisma.notification.count({ where: { tenantId: req.user.tenantId, isRead: false } }),
            prisma_1.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
        ]);
        res.json({ data, unreadCount, pagination: { page: q.page, pageSize: q.pageSize, total } });
    }
    catch (err) {
        next(err);
    }
});
exports.notificationsRouter.put("/:id/read", (0, auth_1.requirePermission)("notifications", "view"), async (req, res, next) => {
    try {
        const notification = await prisma_1.prisma.notification.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!notification)
            throw new errors_1.NotFoundError("Notification not found");
        const updated = await prisma_1.prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
        res.json({ data: updated });
    }
    catch (err) {
        next(err);
    }
});
exports.notificationsRouter.put("/read-all", (0, auth_1.requirePermission)("notifications", "view"), async (req, res, next) => {
    try {
        await prisma_1.prisma.notification.updateMany({ where: { tenantId: req.user.tenantId, isRead: false }, data: { isRead: true } });
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
