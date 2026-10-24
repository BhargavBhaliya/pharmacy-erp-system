"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purchaseOrdersRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const documentNumber_1 = require("../../lib/documentNumber");
const purchase_validation_1 = require("./purchase.validation");
exports.purchaseOrdersRouter = (0, express_1.Router)();
exports.purchaseOrdersRouter.use(auth_1.authenticate);
const poInclude = {
    supplier: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true } },
    items: { include: { product: { select: { id: true, name: true, sku: true } } } },
};
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
exports.purchaseOrdersRouter.get("/", (0, auth_1.requirePermission)("purchase", "view"), async (req, res, next) => {
    try {
        const orders = await prisma_1.prisma.purchaseOrder.findMany({
            where: { tenantId: req.user.tenantId, branchId: { in: req.user.branchIds } },
            include: poInclude,
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        res.json({ data: orders });
    }
    catch (err) {
        next(err);
    }
});
exports.purchaseOrdersRouter.get("/:id", (0, auth_1.requirePermission)("purchase", "view"), async (req, res, next) => {
    try {
        const order = await prisma_1.prisma.purchaseOrder.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: poInclude });
        if (!order)
            throw new errors_1.NotFoundError("Purchase order not found");
        assertBranchAccessible(req, order.branchId);
        res.json({ data: order });
    }
    catch (err) {
        next(err);
    }
});
exports.purchaseOrdersRouter.post("/", (0, auth_1.requirePermission)("purchase", "add"), (0, validate_1.validateBody)(purchase_validation_1.createPurchaseOrderSchema), async (req, res, next) => {
    try {
        assertBranchAccessible(req, req.body.branchId);
        const supplier = await prisma_1.prisma.supplier.findFirst({ where: { id: req.body.supplierId, tenantId: req.user.tenantId } });
        if (!supplier)
            throw new errors_1.ValidationError("Invalid supplierId for this tenant");
        const order = await prisma_1.prisma.$transaction(async (tx) => {
            const orderNumber = await (0, documentNumber_1.getNextDocumentNumber)(tx, {
                tenantId: req.user.tenantId,
                branchId: req.body.branchId,
                docType: "PURCHASE_ORDER",
                prefix: "PO",
            });
            return tx.purchaseOrder.create({
                data: {
                    tenantId: req.user.tenantId,
                    branchId: req.body.branchId,
                    supplierId: req.body.supplierId,
                    orderNumber,
                    status: "SENT",
                    expectedDate: req.body.expectedDate,
                    notes: req.body.notes,
                    createdById: req.user.id,
                    items: { create: req.body.items },
                },
                include: poInclude,
            });
        });
        (0, audit_1.recordAudit)({ req, module: "purchase", action: "create_order", entityType: "PurchaseOrder", entityId: order.id, newValue: { orderNumber: order.orderNumber }, branchId: order.branchId });
        res.status(201).json({ data: order });
    }
    catch (err) {
        next(err);
    }
});
exports.purchaseOrdersRouter.put("/:id/cancel", (0, auth_1.requirePermission)("purchase", "cancel"), async (req, res, next) => {
    try {
        const order = await prisma_1.prisma.purchaseOrder.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!order)
            throw new errors_1.NotFoundError("Purchase order not found");
        assertBranchAccessible(req, order.branchId);
        if (order.status === "RECEIVED" || order.status === "PARTIALLY_RECEIVED") {
            throw new errors_1.ValidationError("Cannot cancel a purchase order that has already received stock");
        }
        const updated = await prisma_1.prisma.purchaseOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" }, include: poInclude });
        (0, audit_1.recordAudit)({ req, module: "purchase", action: "cancel_order", entityType: "PurchaseOrder", entityId: order.id, branchId: order.branchId });
        res.json({ data: updated });
    }
    catch (err) {
        next(err);
    }
});
