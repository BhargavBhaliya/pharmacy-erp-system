"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchesRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const batches_validation_1 = require("./batches.validation");
exports.batchesRouter = (0, express_1.Router)();
exports.batchesRouter.use(auth_1.authenticate);
const batchInclude = {
    product: { select: { id: true, name: true, sku: true, unit: { select: { name: true } } } },
    manufacturer: { select: { id: true, name: true } },
    supplier: { select: { id: true, name: true } },
};
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId)) {
        throw new errors_1.ForbiddenError("You do not have access to this branch");
    }
}
exports.batchesRouter.get("/", (0, auth_1.requirePermission)("batches", "view"), async (req, res, next) => {
    try {
        const q = batches_validation_1.batchQuerySchema.parse(req.query);
        if (q.branchId)
            assertBranchAccessible(req, q.branchId);
        const now = new Date();
        const statusFilter = q.status === "expired"
            ? { expiryDate: { lte: now } }
            : q.status === "available"
                ? { expiryDate: { gt: now }, quantity: { gt: 0 } }
                : q.status === "near_expiry"
                    ? { expiryDate: { gt: now } } // near-expiry window applied client-side / via /inventory/expiry
                    : {};
        const where = {
            tenantId: req.user.tenantId,
            branchId: q.branchId ? q.branchId : { in: req.user.branchIds },
            ...(q.productId ? { productId: q.productId } : {}),
            ...statusFilter,
        };
        const [total, data] = await Promise.all([
            prisma_1.prisma.batch.count({ where }),
            prisma_1.prisma.batch.findMany({
                where,
                include: batchInclude,
                orderBy: { expiryDate: "asc" },
                skip: (q.page - 1) * q.pageSize,
                take: q.pageSize,
            }),
        ]);
        res.json({ data, pagination: { page: q.page, pageSize: q.pageSize, total } });
    }
    catch (err) {
        next(err);
    }
});
exports.batchesRouter.post("/", (0, auth_1.requirePermission)("batches", "add"), (0, validate_1.validateBody)(batches_validation_1.createBatchSchema), async (req, res, next) => {
    try {
        assertBranchAccessible(req, req.body.branchId);
        const product = await prisma_1.prisma.product.findFirst({ where: { id: req.body.productId, tenantId: req.user.tenantId } });
        if (!product)
            throw new errors_1.ValidationError("Invalid productId for this tenant");
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            const batch = await tx.batch.create({
                data: { ...req.body, tenantId: req.user.tenantId },
                include: batchInclude,
            });
            if (batch.quantity > 0) {
                await tx.stockTransaction.create({
                    data: {
                        tenantId: req.user.tenantId,
                        branchId: batch.branchId,
                        productId: batch.productId,
                        batchId: batch.id,
                        type: "OPENING",
                        quantity: batch.quantity,
                        createdById: req.user.id,
                        notes: "Batch created",
                    },
                });
            }
            return batch;
        });
        (0, audit_1.recordAudit)({ req, module: "batches", action: "create", entityType: "Batch", entityId: result.id, newValue: { batchNumber: result.batchNumber, quantity: result.quantity }, branchId: result.branchId });
        res.status(201).json({ data: result });
    }
    catch (err) {
        next(err);
    }
});
exports.batchesRouter.put("/:id", (0, auth_1.requirePermission)("batches", "edit"), (0, validate_1.validateBody)(batches_validation_1.updateBatchSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.batch.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Batch not found");
        assertBranchAccessible(req, existing.branchId);
        const batch = await prisma_1.prisma.batch.update({ where: { id: existing.id }, data: req.body, include: batchInclude });
        (0, audit_1.recordAudit)({ req, module: "batches", action: "update", entityType: "Batch", entityId: batch.id, oldValue: existing, newValue: batch, branchId: batch.branchId });
        res.json({ data: batch });
    }
    catch (err) {
        next(err);
    }
});
