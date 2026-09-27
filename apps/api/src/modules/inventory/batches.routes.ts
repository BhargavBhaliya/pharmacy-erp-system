import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { createBatchSchema, batchQuerySchema, updateBatchSchema } from "./batches.validation";

export const batchesRouter = Router();
batchesRouter.use(authenticate);

const batchInclude = {
  product: { select: { id: true, name: true, sku: true, unit: { select: { name: true } } } },
  manufacturer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
} as const;

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) {
    throw new ForbiddenError("You do not have access to this branch");
  }
}

batchesRouter.get("/", requirePermission("batches", "view"), async (req, res, next) => {
  try {
    const q = batchQuerySchema.parse(req.query);
    if (q.branchId) assertBranchAccessible(req, q.branchId);

    const now = new Date();
    const statusFilter =
      q.status === "expired"
        ? { expiryDate: { lte: now } }
        : q.status === "available"
        ? { expiryDate: { gt: now }, quantity: { gt: 0 } }
        : q.status === "near_expiry"
        ? { expiryDate: { gt: now } } // near-expiry window applied client-side / via /inventory/expiry
        : {};

    const where = {
      tenantId: req.user!.tenantId,
      branchId: q.branchId ? q.branchId : { in: req.user!.branchIds },
      ...(q.productId ? { productId: q.productId } : {}),
      ...statusFilter,
    };

    const [total, data] = await Promise.all([
      prisma.batch.count({ where }),
      prisma.batch.findMany({
        where,
        include: batchInclude,
        orderBy: { expiryDate: "asc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    res.json({ data, pagination: { page: q.page, pageSize: q.pageSize, total } });
  } catch (err) {
    next(err);
  }
});

batchesRouter.post("/", requirePermission("batches", "add"), validateBody(createBatchSchema), async (req, res, next) => {
  try {
    assertBranchAccessible(req, req.body.branchId);

    const product = await prisma.product.findFirst({ where: { id: req.body.productId, tenantId: req.user!.tenantId } });
    if (!product) throw new ValidationError("Invalid productId for this tenant");

    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.batch.create({
        data: { ...req.body, tenantId: req.user!.tenantId },
        include: batchInclude,
      });
      if (batch.quantity > 0) {
        await tx.stockTransaction.create({
          data: {
            tenantId: req.user!.tenantId,
            branchId: batch.branchId,
            productId: batch.productId,
            batchId: batch.id,
            type: "OPENING",
            quantity: batch.quantity,
            createdById: req.user!.id,
            notes: "Batch created",
          },
        });
      }
      return batch;
    });

    recordAudit({ req, module: "batches", action: "create", entityType: "Batch", entityId: result.id, newValue: { batchNumber: result.batchNumber, quantity: result.quantity }, branchId: result.branchId });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

batchesRouter.put("/:id", requirePermission("batches", "edit"), validateBody(updateBatchSchema), async (req, res, next) => {
  try {
    const existing = await prisma.batch.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Batch not found");
    assertBranchAccessible(req, existing.branchId);

    const batch = await prisma.batch.update({ where: { id: existing.id }, data: req.body, include: batchInclude });
    recordAudit({ req, module: "batches", action: "update", entityType: "Batch", entityId: batch.id, oldValue: existing, newValue: batch, branchId: batch.branchId });
    res.json({ data: batch });
  } catch (err) {
    next(err);
  }
});
