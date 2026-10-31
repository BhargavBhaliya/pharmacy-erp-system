import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { adjustStock } from "../../lib/inventory";
import { parseDateParam } from "../../lib/dateParam";
import { createStockTransferSchema } from "./stock-transfer.validation";

export const stockTransferRouter = Router();
stockTransferRouter.use(authenticate);

const transferInclude = {
  fromBranch: { select: { id: true, name: true } },
  toBranch: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } }, batch: { select: { id: true, batchNumber: true, expiryDate: true } } } },
} as const;

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

stockTransferRouter.get("/", requirePermission("stock_transfer", "view"), async (req, res, next) => {
  try {
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
    const from = parseDateParam(req.query.from, "from");
    const to = parseDateParam(req.query.to, "to");
    const transfers = await prisma.stockTransfer.findMany({
      where: {
        tenantId: req.user!.tenantId,
        AND: [
          // Branch access control: always required, independent of the optional branchId filter
          // below — a plain object-spread would let a second "OR" key silently clobber this one.
          { OR: [{ fromBranchId: { in: req.user!.branchIds } }, { toBranchId: { in: req.user!.branchIds } }] },
          // Matches either side — "which branch was this transfer done in" covers a branch
          // sending stock out just as much as one receiving it.
          ...(branchId ? [{ OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] }] : []),
          ...(from || to ? [{ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }] : []),
        ],
      },
      include: transferInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ data: transfers });
  } catch (err) {
    next(err);
  }
});

stockTransferRouter.get("/:id", requirePermission("stock_transfer", "view"), async (req, res, next) => {
  try {
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: transferInclude,
    });
    if (!transfer) throw new NotFoundError("Transfer not found");
    if (!req.user!.branchIds.includes(transfer.fromBranchId) && !req.user!.branchIds.includes(transfer.toBranchId)) {
      throw new ForbiddenError("You do not have access to this transfer");
    }
    res.json({ data: transfer });
  } catch (err) {
    next(err);
  }
});

stockTransferRouter.post("/", requirePermission("stock_transfer", "add"), validateBody(createStockTransferSchema), async (req, res, next) => {
  try {
    const { fromBranchId, toBranchId, items, notes } = req.body as typeof req.body;
    if (fromBranchId === toBranchId) throw new ValidationError("Source and destination branch must be different");
    if (!req.user!.branchIds.includes(fromBranchId) && !req.user!.branchIds.includes(toBranchId)) {
      throw new ForbiddenError("You do not have access to either branch in this transfer");
    }

    const batches = await prisma.batch.findMany({
      where: { id: { in: items.map((i: { batchId: string }) => i.batchId) }, tenantId: req.user!.tenantId, branchId: fromBranchId },
    });
    const batchById = new Map(batches.map((b) => [b.id, b]));

    // Sum requested quantity per batch first — two transfer lines pulling from the same batch
    // must be checked together, not against the live quantity independently.
    const requestedByBatch = new Map<string, number>();
    for (const item of items) {
      const batch = batchById.get(item.batchId);
      if (!batch || batch.productId !== item.productId) {
        throw new ValidationError(`Batch ${item.batchId} not found in source branch for this product`);
      }
      requestedByBatch.set(item.batchId, (requestedByBatch.get(item.batchId) ?? 0) + item.quantity);
    }
    for (const [batchId, requestedQty] of requestedByBatch) {
      const batch = batchById.get(batchId)!;
      if (batch.quantity < requestedQty) {
        throw new ValidationError(`Insufficient stock in batch ${batch.batchNumber}: available ${batch.quantity}, requested ${requestedQty}`);
      }
    }

    const transfer = await prisma.stockTransfer.create({
      data: {
        tenantId: req.user!.tenantId,
        fromBranchId,
        toBranchId,
        notes,
        requestedById: req.user!.id,
        items: { create: items },
      },
      include: transferInclude,
    });

    recordAudit({ req, module: "stock_transfer", action: "request", entityType: "StockTransfer", entityId: transfer.id, newValue: { fromBranchId, toBranchId, itemCount: items.length } });
    res.status(201).json({ data: transfer });
  } catch (err) {
    next(err);
  }
});

stockTransferRouter.put("/:id/approve", requirePermission("stock_transfer", "approve"), async (req, res, next) => {
  try {
    const transfer = await prisma.stockTransfer.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!transfer) throw new NotFoundError("Transfer not found");
    assertBranchAccessible(req, transfer.fromBranchId);
    if (transfer.status !== "REQUESTED") throw new ValidationError(`Cannot approve a transfer in status ${transfer.status}`);

    const updated = await prisma.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: "APPROVED", approvedById: req.user!.id },
      include: transferInclude,
    });
    recordAudit({ req, module: "stock_transfer", action: "approve", entityType: "StockTransfer", entityId: transfer.id });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

stockTransferRouter.put("/:id/reject", requirePermission("stock_transfer", "approve"), async (req, res, next) => {
  try {
    const transfer = await prisma.stockTransfer.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!transfer) throw new NotFoundError("Transfer not found");
    assertBranchAccessible(req, transfer.fromBranchId);
    if (transfer.status !== "REQUESTED") throw new ValidationError(`Cannot reject a transfer in status ${transfer.status}`);

    const updated = await prisma.stockTransfer.update({ where: { id: transfer.id }, data: { status: "REJECTED" }, include: transferInclude });
    recordAudit({ req, module: "stock_transfer", action: "reject", entityType: "StockTransfer", entityId: transfer.id });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

stockTransferRouter.put("/:id/dispatch", requirePermission("stock_transfer", "add"), async (req, res, next) => {
  try {
    const transfer = await prisma.stockTransfer.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId }, include: transferInclude });
    if (!transfer) throw new NotFoundError("Transfer not found");
    assertBranchAccessible(req, transfer.fromBranchId);
    if (transfer.status !== "APPROVED") throw new ValidationError(`Cannot dispatch a transfer in status ${transfer.status}`);

    await prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await adjustStock(tx, {
          tenantId: req.user!.tenantId,
          branchId: transfer.fromBranchId,
          batchId: item.batchId,
          productId: item.productId,
          quantityDelta: -item.quantity,
          type: "TRANSFER_OUT",
          referenceType: "StockTransfer",
          referenceId: transfer.id,
          createdById: req.user!.id,
        });
      }
      await tx.stockTransfer.update({ where: { id: transfer.id }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
    });

    const updated = await prisma.stockTransfer.findFirst({ where: { id: transfer.id }, include: transferInclude });
    recordAudit({ req, module: "stock_transfer", action: "dispatch", entityType: "StockTransfer", entityId: transfer.id });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

stockTransferRouter.put("/:id/receive", requirePermission("stock_transfer", "add"), async (req, res, next) => {
  try {
    const transfer = await prisma.stockTransfer.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId }, include: transferInclude });
    if (!transfer) throw new NotFoundError("Transfer not found");
    assertBranchAccessible(req, transfer.toBranchId);
    if (transfer.status !== "DISPATCHED") throw new ValidationError(`Cannot receive a transfer in status ${transfer.status}`);

    await prisma.$transaction(async (tx) => {
      // Batch-fetch every source batch and every already-existing destination batch up front
      // (two queries) instead of one findUniqueOrThrow + one findFirst per item — a transfer of
      // N items previously issued 2N+ sequential reads inside this same transaction.
      const sourceBatches = await tx.batch.findMany({ where: { id: { in: transfer.items.map((i) => i.batchId) } } });
      const sourceBatchById = new Map(sourceBatches.map((b) => [b.id, b]));

      const destKey = (productId: string, batchNumber: string) => `${productId}|${batchNumber}`;
      const existingDestBatches = await tx.batch.findMany({
        where: {
          branchId: transfer.toBranchId,
          OR: transfer.items.map((item) => ({ productId: item.productId, batchNumber: sourceBatchById.get(item.batchId)!.batchNumber })),
        },
      });
      const destBatchByKey = new Map(existingDestBatches.map((b) => [destKey(b.productId, b.batchNumber), b]));

      for (const item of transfer.items) {
        const sourceBatch = sourceBatchById.get(item.batchId)!;

        // Find or create the matching batch in the destination branch (same product + batch
        // number + expiry uniquely identifies "the same stock" per the @@unique on Batch).
        let destBatch = destBatchByKey.get(destKey(item.productId, sourceBatch.batchNumber));
        if (!destBatch) {
          destBatch = await tx.batch.create({
            data: {
              tenantId: req.user!.tenantId,
              branchId: transfer.toBranchId,
              productId: item.productId,
              batchNumber: sourceBatch.batchNumber,
              manufacturerId: sourceBatch.manufacturerId,
              supplierId: sourceBatch.supplierId,
              mfgDate: sourceBatch.mfgDate,
              expiryDate: sourceBatch.expiryDate,
              purchaseRate: sourceBatch.purchaseRate,
              mrp: sourceBatch.mrp,
              gstRatePercent: sourceBatch.gstRatePercent,
              quantity: 0,
            },
          });
          destBatchByKey.set(destKey(item.productId, sourceBatch.batchNumber), destBatch);
        }

        await adjustStock(tx, {
          tenantId: req.user!.tenantId,
          branchId: transfer.toBranchId,
          batchId: destBatch.id,
          productId: item.productId,
          quantityDelta: item.quantity,
          type: "TRANSFER_IN",
          referenceType: "StockTransfer",
          referenceId: transfer.id,
          createdById: req.user!.id,
        });
      }
      await tx.stockTransfer.update({ where: { id: transfer.id }, data: { status: "RECEIVED", receivedAt: new Date() } });
    });

    const updated = await prisma.stockTransfer.findFirst({ where: { id: transfer.id }, include: transferInclude });
    recordAudit({ req, module: "stock_transfer", action: "receive", entityType: "StockTransfer", entityId: transfer.id });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});
