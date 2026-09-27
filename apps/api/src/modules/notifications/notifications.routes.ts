import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { NotFoundError } from "../../lib/errors";

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

const listQuery = z.object({
  unreadOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

notificationsRouter.get("/", requirePermission("notifications", "view"), async (req, res, next) => {
  try {
    const q = listQuery.parse(req.query);
    const where = { tenantId: req.user!.tenantId, ...(q.unreadOnly ? { isRead: false } : {}) };

    const [total, unreadCount, data] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { tenantId: req.user!.tenantId, isRead: false } }),
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);

    res.json({ data, unreadCount, pagination: { page: q.page, pageSize: q.pageSize, total } });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.put("/:id/read", requirePermission("notifications", "view"), async (req, res, next) => {
  try {
    const notification = await prisma.notification.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!notification) throw new NotFoundError("Notification not found");

    const updated = await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.put("/read-all", requirePermission("notifications", "view"), async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { tenantId: req.user!.tenantId, isRead: false }, data: { isRead: true } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
