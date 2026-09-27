import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";

export const auditRouter = Router();
auditRouter.use(authenticate);

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  module: z.string().optional(),
  entityType: z.string().optional(),
  userId: z.string().optional(),
});

auditRouter.get("/", requirePermission("audit_logs", "view"), async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const where = {
      tenantId: req.user!.tenantId,
      ...(q.module ? { module: q.module } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    res.json({ data, pagination: { page: q.page, pageSize: q.pageSize, total } });
  } catch (err) {
    next(err);
  }
});
