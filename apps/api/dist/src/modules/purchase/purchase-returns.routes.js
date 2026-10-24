"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purchaseReturnsRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const documentNumber_1 = require("../../lib/documentNumber");
const inventory_1 = require("../../lib/inventory");
const purchase_validation_1 = require("./purchase.validation");
exports.purchaseReturnsRouter = (0, express_1.Router)();
exports.purchaseReturnsRouter.use(auth_1.authenticate);
const returnInclude = {
    supplier: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true } },
    purchase: { select: { id: true, referenceNumber: true } },
    items: { include: { product: { select: { id: true, name: true, sku: true } }, batch: { select: { id: true, batchNumber: true } } } },
};
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
exports.purchaseReturnsRouter.get("/", (0, auth_1.requirePermission)("purchase_return", "view"), async (req, res, next) => {
    try {
        const returns = await prisma_1.prisma.purchaseReturn.findMany({
            where: { tenantId: req.user.tenantId, branchId: { in: req.user.branchIds } },
            include: returnInclude,
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        res.json({ data: returns });
    }
    catch (err) {
        next(err);
    }
});
// Returns go straight back to the supplier (no pending/approve step, unlike sales returns), so
// stock and the purchase's own totals are adjusted in the same transaction that creates the return.
exports.purchaseReturnsRouter.post("/", (0, auth_1.requirePermission)("purchase_return", "add"), (0, validate_1.validateBody)(purchase_validation_1.createPurchaseReturnSchema), async (req, res, next) => {
    try {
        const body = req.body;
        const purchase = await prisma_1.prisma.purchase.findFirst({ where: { id: body.purchaseId, tenantId: req.user.tenantId }, include: { items: true } });
        if (!purchase)
            throw new errors_1.ValidationError("Invalid purchaseId for this tenant");
        assertBranchAccessible(req, purchase.branchId);
        if (purchase.status === "CANCELLED")
            throw new errors_1.ValidationError("Cannot return items from a cancelled purchase");
        const purchaseItemById = new Map(purchase.items.map((i) => [i.id, i]));
        // One grouped query covering every line in the request, instead of a separate
        // "how much of this line was already returned" lookup per item.
        const returnedGroups = await prisma_1.prisma.purchaseReturnItem.groupBy({
            by: ["purchaseItemId"],
            where: { purchaseItemId: { in: body.items.map((i) => i.purchaseItemId) } },
            _sum: { quantity: true },
        });
        const alreadyReturnedByItem = new Map(returnedGroups.map((g) => [g.purchaseItemId, g._sum.quantity ?? 0]));
        let totalAmount = 0;
        const itemsData = [];
        for (const item of body.items) {
            const purchaseItem = purchaseItemById.get(item.purchaseItemId);
            if (!purchaseItem)
                throw new errors_1.ValidationError(`Purchase item ${item.purchaseItemId} does not belong to this purchase`);
            if (!purchaseItem.batchId)
                throw new errors_1.ValidationError(`Purchase item ${item.purchaseItemId} has no batch to return stock against`);
            const alreadyReturned = alreadyReturnedByItem.get(item.purchaseItemId) ?? 0;
            if (alreadyReturned + item.quantity > purchaseItem.quantity) {
                throw new errors_1.ValidationError(`Cannot return ${item.quantity}: only ${purchaseItem.quantity - alreadyReturned} of this line remains returnable`);
            }
            const batch = await prisma_1.prisma.batch.findUniqueOrThrow({ where: { id: purchaseItem.batchId } });
            if (batch.quantity < item.quantity) {
                throw new errors_1.ValidationError(`Insufficient stock in batch ${batch.batchNumber}: available ${batch.quantity}, requested ${item.quantity}`);
            }
            const unitRate = Number(purchaseItem.lineTotal) / purchaseItem.quantity;
            const lineTotal = round2(unitRate * item.quantity);
            totalAmount += lineTotal;
            itemsData.push({
                purchaseItemId: item.purchaseItemId,
                productId: purchaseItem.productId,
                batchId: purchaseItem.batchId,
                quantity: item.quantity,
                rate: round2(unitRate),
                lineTotal,
            });
        }
        totalAmount = round2(totalAmount);
        const created = await prisma_1.prisma.$transaction(async (tx) => {
            const referenceNumber = await (0, documentNumber_1.getNextDocumentNumber)(tx, {
                tenantId: req.user.tenantId,
                branchId: purchase.branchId,
                docType: "PURCHASE_RETURN",
                prefix: "PRET",
            });
            const purchaseReturn = await tx.purchaseReturn.create({
                data: {
                    tenantId: req.user.tenantId,
                    branchId: purchase.branchId,
                    supplierId: purchase.supplierId,
                    purchaseId: purchase.id,
                    referenceNumber,
                    reason: body.reason,
                    totalAmount,
                    createdById: req.user.id,
                    items: { create: itemsData },
                },
            });
            for (const item of itemsData) {
                await (0, inventory_1.adjustStock)(tx, {
                    tenantId: req.user.tenantId,
                    branchId: purchase.branchId,
                    batchId: item.batchId,
                    productId: item.productId,
                    quantityDelta: -item.quantity,
                    type: "PURCHASE_RETURN",
                    referenceType: "PurchaseReturn",
                    referenceId: purchaseReturn.id,
                    createdById: req.user.id,
                });
            }
            // Keep the original purchase invoice honest: once goods actually go back to the
            // supplier, the purchase's own totals should read as if the returned line was never
            // bought, not still show the original (now-overstated) amount forever. paidAmount comes
            // down by the same amount (the supplier owes that value back, whether as a refund or a
            // lower balance owed to them), capped at 0 — never allowed to go negative or to exceed
            // the new totalAmount.
            const newTotalAmount = round2(Math.max(Number(purchase.totalAmount) - totalAmount, 0));
            const newPaidAmount = round2(Math.max(Math.min(Number(purchase.paidAmount) - totalAmount, newTotalAmount), 0));
            const newPaymentStatus = newPaidAmount <= 0 ? "UNPAID" : newPaidAmount >= newTotalAmount - 0.01 ? "PAID" : "PARTIAL";
            await tx.purchase.update({
                where: { id: purchase.id },
                data: { totalAmount: newTotalAmount, paidAmount: newPaidAmount, paymentStatus: newPaymentStatus },
            });
            return purchaseReturn;
        });
        const full = await prisma_1.prisma.purchaseReturn.findFirst({ where: { id: created.id }, include: returnInclude });
        (0, audit_1.recordAudit)({ req, module: "purchase_return", action: "create", entityType: "PurchaseReturn", entityId: created.id, newValue: { referenceNumber: created.referenceNumber, totalAmount }, branchId: purchase.branchId });
        res.status(201).json({ data: full });
    }
    catch (err) {
        next(err);
    }
});
