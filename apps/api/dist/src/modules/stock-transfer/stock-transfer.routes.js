"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stockTransferRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const inventory_1 = require("../../lib/inventory");
const stock_transfer_validation_1 = require("./stock-transfer.validation");
exports.stockTransferRouter = (0, express_1.Router)();
exports.stockTransferRouter.use(auth_1.authenticate);
const transferInclude = {
    fromBranch: { select: { id: true, name: true } },
    toBranch: { select: { id: true, name: true } },
    items: { include: { product: { select: { id: true, name: true, sku: true } }, batch: { select: { id: true, batchNumber: true, expiryDate: true } } } },
};
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
exports.stockTransferRouter.get("/", (0, auth_1.requirePermission)("stock_transfer", "view"), async (req, res, next) => {
    try {
        const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
        const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
        const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
        const transfers = await prisma_1.prisma.stockTransfer.findMany({
            where: {
                tenantId: req.user.tenantId,
                AND: [
                    // Branch access control: always required, independent of the optional branchId filter
                    // below — a plain object-spread would let a second "OR" key silently clobber this one.
                    { OR: [{ fromBranchId: { in: req.user.branchIds } }, { toBranchId: { in: req.user.branchIds } }] },
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
    }
    catch (err) {
        next(err);
    }
});
exports.stockTransferRouter.get("/:id", (0, auth_1.requirePermission)("stock_transfer", "view"), async (req, res, next) => {
    try {
        const transfer = await prisma_1.prisma.stockTransfer.findFirst({
            where: { id: req.params.id, tenantId: req.user.tenantId },
            include: transferInclude,
        });
        if (!transfer)
            throw new errors_1.NotFoundError("Transfer not found");
        if (!req.user.branchIds.includes(transfer.fromBranchId) && !req.user.branchIds.includes(transfer.toBranchId)) {
            throw new errors_1.ForbiddenError("You do not have access to this transfer");
        }
        res.json({ data: transfer });
    }
    catch (err) {
        next(err);
    }
});
exports.stockTransferRouter.post("/", (0, auth_1.requirePermission)("stock_transfer", "add"), (0, validate_1.validateBody)(stock_transfer_validation_1.createStockTransferSchema), async (req, res, next) => {
    try {
        const { fromBranchId, toBranchId, items, notes } = req.body;
        if (fromBranchId === toBranchId)
            throw new errors_1.ValidationError("Source and destination branch must be different");
        if (!req.user.branchIds.includes(fromBranchId) && !req.user.branchIds.includes(toBranchId)) {
            throw new errors_1.ForbiddenError("You do not have access to either branch in this transfer");
        }
        const batches = await prisma_1.prisma.batch.findMany({
            where: { id: { in: items.map((i) => i.batchId) }, tenantId: req.user.tenantId, branchId: fromBranchId },
        });
        const batchById = new Map(batches.map((b) => [b.id, b]));
        // Sum requested quantity per batch first — two transfer lines pulling from the same batch
        // must be checked together, not against the live quantity independently.
        const requestedByBatch = new Map();
        for (const item of items) {
            const batch = batchById.get(item.batchId);
            if (!batch || batch.productId !== item.productId) {
                throw new errors_1.ValidationError(`Batch ${item.batchId} not found in source branch for this product`);
            }
            requestedByBatch.set(item.batchId, (requestedByBatch.get(item.batchId) ?? 0) + item.quantity);
        }
        for (const [batchId, requestedQty] of requestedByBatch) {
            const batch = batchById.get(batchId);
            if (batch.quantity < requestedQty) {
                throw new errors_1.ValidationError(`Insufficient stock in batch ${batch.batchNumber}: available ${batch.quantity}, requested ${requestedQty}`);
            }
        }
        const transfer = await prisma_1.prisma.stockTransfer.create({
            data: {
                tenantId: req.user.tenantId,
                fromBranchId,
                toBranchId,
                notes,
                requestedById: req.user.id,
                items: { create: items },
            },
            include: transferInclude,
        });
        (0, audit_1.recordAudit)({ req, module: "stock_transfer", action: "request", entityType: "StockTransfer", entityId: transfer.id, newValue: { fromBranchId, toBranchId, itemCount: items.length } });
        res.status(201).json({ data: transfer });
    }
    catch (err) {
        next(err);
    }
});
exports.stockTransferRouter.put("/:id/approve", (0, auth_1.requirePermission)("stock_transfer", "approve"), async (req, res, next) => {
    try {
        const transfer = await prisma_1.prisma.stockTransfer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!transfer)
            throw new errors_1.NotFoundError("Transfer not found");
        assertBranchAccessible(req, transfer.fromBranchId);
        if (transfer.status !== "REQUESTED")
            throw new errors_1.ValidationError(`Cannot approve a transfer in status ${transfer.status}`);
        const updated = await prisma_1.prisma.stockTransfer.update({
            where: { id: transfer.id },
            data: { status: "APPROVED", approvedById: req.user.id },
            include: transferInclude,
        });
        (0, audit_1.recordAudit)({ req, module: "stock_transfer", action: "approve", entityType: "StockTransfer", entityId: transfer.id });
        res.json({ data: updated });
    }
    catch (err) {
        next(err);
    }
});
exports.stockTransferRouter.put("/:id/reject", (0, auth_1.requirePermission)("stock_transfer", "approve"), async (req, res, next) => {
    try {
        const transfer = await prisma_1.prisma.stockTransfer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!transfer)
            throw new errors_1.NotFoundError("Transfer not found");
        assertBranchAccessible(req, transfer.fromBranchId);
        if (transfer.status !== "REQUESTED")
            throw new errors_1.ValidationError(`Cannot reject a transfer in status ${transfer.status}`);
        const updated = await prisma_1.prisma.stockTransfer.update({ where: { id: transfer.id }, data: { status: "REJECTED" }, include: transferInclude });
        (0, audit_1.recordAudit)({ req, module: "stock_transfer", action: "reject", entityType: "StockTransfer", entityId: transfer.id });
        res.json({ data: updated });
    }
    catch (err) {
        next(err);
    }
});
exports.stockTransferRouter.put("/:id/dispatch", (0, auth_1.requirePermission)("stock_transfer", "add"), async (req, res, next) => {
    try {
        const transfer = await prisma_1.prisma.stockTransfer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: transferInclude });
        if (!transfer)
            throw new errors_1.NotFoundError("Transfer not found");
        assertBranchAccessible(req, transfer.fromBranchId);
        if (transfer.status !== "APPROVED")
            throw new errors_1.ValidationError(`Cannot dispatch a transfer in status ${transfer.status}`);
        await prisma_1.prisma.$transaction(async (tx) => {
            for (const item of transfer.items) {
                await (0, inventory_1.adjustStock)(tx, {
                    tenantId: req.user.tenantId,
                    branchId: transfer.fromBranchId,
                    batchId: item.batchId,
                    productId: item.productId,
                    quantityDelta: -item.quantity,
                    type: "TRANSFER_OUT",
                    referenceType: "StockTransfer",
                    referenceId: transfer.id,
                    createdById: req.user.id,
                });
            }
            await tx.stockTransfer.update({ where: { id: transfer.id }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
        });
        const updated = await prisma_1.prisma.stockTransfer.findFirst({ where: { id: transfer.id }, include: transferInclude });
        (0, audit_1.recordAudit)({ req, module: "stock_transfer", action: "dispatch", entityType: "StockTransfer", entityId: transfer.id });
        res.json({ data: updated });
    }
    catch (err) {
        next(err);
    }
});
exports.stockTransferRouter.put("/:id/receive", (0, auth_1.requirePermission)("stock_transfer", "add"), async (req, res, next) => {
    try {
        const transfer = await prisma_1.prisma.stockTransfer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: transferInclude });
        if (!transfer)
            throw new errors_1.NotFoundError("Transfer not found");
        assertBranchAccessible(req, transfer.toBranchId);
        if (transfer.status !== "DISPATCHED")
            throw new errors_1.ValidationError(`Cannot receive a transfer in status ${transfer.status}`);
        await prisma_1.prisma.$transaction(async (tx) => {
            // Batch-fetch every source batch and every already-existing destination batch up front
            // (two queries) instead of one findUniqueOrThrow + one findFirst per item — a transfer of
            // N items previously issued 2N+ sequential reads inside this same transaction.
            const sourceBatches = await tx.batch.findMany({ where: { id: { in: transfer.items.map((i) => i.batchId) } } });
            const sourceBatchById = new Map(sourceBatches.map((b) => [b.id, b]));
            const destKey = (productId, batchNumber) => `${productId}|${batchNumber}`;
            const existingDestBatches = await tx.batch.findMany({
                where: {
                    branchId: transfer.toBranchId,
                    OR: transfer.items.map((item) => ({ productId: item.productId, batchNumber: sourceBatchById.get(item.batchId).batchNumber })),
                },
            });
            const destBatchByKey = new Map(existingDestBatches.map((b) => [destKey(b.productId, b.batchNumber), b]));
            for (const item of transfer.items) {
                const sourceBatch = sourceBatchById.get(item.batchId);
                // Find or create the matching batch in the destination branch (same product + batch
                // number + expiry uniquely identifies "the same stock" per the @@unique on Batch).
                let destBatch = destBatchByKey.get(destKey(item.productId, sourceBatch.batchNumber));
                if (!destBatch) {
                    destBatch = await tx.batch.create({
                        data: {
                            tenantId: req.user.tenantId,
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
                await (0, inventory_1.adjustStock)(tx, {
                    tenantId: req.user.tenantId,
                    branchId: transfer.toBranchId,
                    batchId: destBatch.id,
                    productId: item.productId,
                    quantityDelta: item.quantity,
                    type: "TRANSFER_IN",
                    referenceType: "StockTransfer",
                    referenceId: transfer.id,
                    createdById: req.user.id,
                });
            }
            await tx.stockTransfer.update({ where: { id: transfer.id }, data: { status: "RECEIVED", receivedAt: new Date() } });
        });
        const updated = await prisma_1.prisma.stockTransfer.findFirst({ where: { id: transfer.id }, include: transferInclude });
        (0, audit_1.recordAudit)({ req, module: "stock_transfer", action: "receive", entityType: "StockTransfer", entityId: transfer.id });
        res.json({ data: updated });
    }
    catch (err) {
        next(err);
    }
});
