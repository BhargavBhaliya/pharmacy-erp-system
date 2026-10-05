import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { getNextDocumentNumber } from "../../lib/documentNumber";
import { adjustStock } from "../../lib/inventory";
import { createPurchaseReturnSchema, type CreatePurchaseReturnInput } from "./purchase.validation";

export const purchaseReturnsRouter = Router();
purchaseReturnsRouter.use(authenticate);

const returnInclude = {
  supplier: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } }, batch: { select: { id: true, batchNumber: true } } } },
} as const;

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

purchaseReturnsRouter.get("/", requirePermission("purchase_return", "view"), async (req, res, next) => {
  try {
    const returns = await prisma.purchaseReturn.findMany({
      where: { tenantId: req.user!.tenantId, branchId: { in: req.user!.branchIds } },
      include: returnInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ data: returns });
  } catch (err) {
    next(err);
  }
});

purchaseReturnsRouter.post(
  "/",
  requirePermission("purchase_return", "add"),
  validateBody(createPurchaseReturnSchema),
  async (req, res, next) => {
    try {
      const body = req.body as CreatePurchaseReturnInput;
      assertBranchAccessible(req, body.branchId);

      const supplier = await prisma.supplier.findFirst({ where: { id: body.supplierId, tenantId: req.user!.tenantId } });
      if (!supplier) throw new ValidationError("Invalid supplierId for this tenant");

      const returnBatches = await prisma.batch.findMany({
        where: { id: { in: body.items.map((i) => i.batchId) }, tenantId: req.user!.tenantId, branchId: body.branchId },
      });
      const returnBatchById = new Map(returnBatches.map((b) => [b.id, b]));
      const returnQtyByBatch = new Map<string, number>();
      for (const item of body.items) {
        const batch = returnBatchById.get(item.batchId);
        if (!batch || batch.productId !== item.productId) {
          throw new ValidationError(`Batch ${item.batchId} not found in this branch for this product`);
        }
        returnQtyByBatch.set(item.batchId, (returnQtyByBatch.get(item.batchId) ?? 0) + item.quantity);
      }
      for (const [batchId, requestedQty] of returnQtyByBatch) {
        const batch = returnBatchById.get(batchId)!;
        if (batch.quantity < requestedQty) {
          throw new ValidationError(`Insufficient stock in batch ${batch.batchNumber}: available ${batch.quantity}, requested ${requestedQty}`);
        }
      }

      const totalAmount = body.items.reduce((sum, i) => sum + i.quantity * i.rate, 0);

      const purchaseReturn = await prisma.$transaction(async (tx) => {
        const referenceNumber = await getNextDocumentNumber(tx, {
          tenantId: req.user!.tenantId,
          branchId: body.branchId,
          docType: "PURCHASE_RETURN",
          prefix: "PRET",
        });

        const created = await tx.purchaseReturn.create({
          data: {
            tenantId: req.user!.tenantId,
            branchId: body.branchId,
            supplierId: body.supplierId,
            purchaseId: body.purchaseId,
            referenceNumber,
            reason: body.reason,
            totalAmount,
            createdById: req.user!.id,
          },
        });

        for (const item of body.items) {
          await tx.purchaseReturnItem.create({
            data: {
              purchaseReturnId: created.id,
              productId: item.productId,
              batchId: item.batchId,
              quantity: item.quantity,
              rate: item.rate,
              lineTotal: item.quantity * item.rate,
            },
          });

          await adjustStock(tx, {
            tenantId: req.user!.tenantId,
            branchId: body.branchId,
            batchId: item.batchId,
            productId: item.productId,
            quantityDelta: -item.quantity,
            type: "PURCHASE_RETURN",
            referenceType: "PurchaseReturn",
            referenceId: created.id,
            createdById: req.user!.id,
          });
        }

        return created;
      });

      const full = await prisma.purchaseReturn.findFirst({ where: { id: purchaseReturn.id }, include: returnInclude });
      recordAudit({ req, module: "purchase_return", action: "create", entityType: "PurchaseReturn", entityId: purchaseReturn.id, newValue: { referenceNumber: purchaseReturn.referenceNumber, totalAmount }, branchId: body.branchId });
      res.status(201).json({ data: full });
    } catch (err) {
      next(err);
    }
  }
);
