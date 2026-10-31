"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purchasesRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const documentNumber_1 = require("../../lib/documentNumber");
const inventory_1 = require("../../lib/inventory");
const purchase_calc_1 = require("./purchase.calc");
const purchase_validation_1 = require("./purchase.validation");
exports.purchasesRouter = (0, express_1.Router)();
exports.purchasesRouter.use(auth_1.authenticate);
const purchaseInclude = {
    supplier: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true, gstin: true, address: true, contactNumber: true } },
    items: { include: { product: { select: { id: true, name: true, sku: true } }, batch: { select: { id: true, batchNumber: true } } } },
    payments: true,
};
// The list view (PurchasesPage.tsx) and every other page sharing this ["purchases"] query key
// (PurchaseReturnsPage, PaymentsPage) only ever read supplier.name plus scalar fields — never
// branch, items, or payments. On a remote DB (every relation is its own round trip, ~60-90ms
// each here), that's 3 unused round trips on every list load. Full `purchaseInclude` stays for
// the single-purchase detail view and after recording a purchase/payment.
const purchaseListInclude = {
    supplier: { select: { id: true, name: true } },
};
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
function paymentStatusFor(totalAmount, paidAmount) {
    if (paidAmount <= 0)
        return "UNPAID";
    if (paidAmount >= totalAmount)
        return "PAID";
    return "PARTIAL";
}
exports.purchasesRouter.get("/", (0, auth_1.requirePermission)("purchase", "view"), async (req, res, next) => {
    try {
        const purchases = await prisma_1.prisma.purchase.findMany({
            where: { tenantId: req.user.tenantId, branchId: { in: req.user.branchIds } },
            include: purchaseListInclude,
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        res.json({ data: purchases });
    }
    catch (err) {
        next(err);
    }
});
// Dashboard figures (today's total, payables) computed with DB-side aggregates rather than
// paging through the (take: 200-capped) list above and summing in JS — that would silently
// under-report once a tenant has more than 200 purchases, since older unpaid bills would fall
// outside the page. Scoped to the caller's own branches regardless of date params.
exports.purchasesRouter.get("/summary", (0, auth_1.requirePermission)("purchase", "view"), async (req, res, next) => {
    try {
        const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
        const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
        const tenantBranchScope = { tenantId: req.user.tenantId, branchId: { in: req.user.branchIds }, status: { not: "CANCELLED" } };
        const [periodAgg, outstandingAgg] = await Promise.all([
            prisma_1.prisma.purchase.aggregate({
                where: { ...tenantBranchScope, ...(from || to ? { purchaseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
                _sum: { totalAmount: true },
            }),
            prisma_1.prisma.purchase.aggregate({ where: tenantBranchScope, _sum: { totalAmount: true, paidAmount: true } }),
        ]);
        res.json({
            data: {
                periodTotal: Number(periodAgg._sum.totalAmount ?? 0),
                payables: Number(outstandingAgg._sum.totalAmount ?? 0) - Number(outstandingAgg._sum.paidAmount ?? 0),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
exports.purchasesRouter.get("/:id", (0, auth_1.requirePermission)("purchase", "view"), async (req, res, next) => {
    try {
        const purchase = await prisma_1.prisma.purchase.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: purchaseInclude });
        if (!purchase)
            throw new errors_1.NotFoundError("Purchase not found");
        assertBranchAccessible(req, purchase.branchId);
        res.json({ data: purchase });
    }
    catch (err) {
        next(err);
    }
});
// Creating a purchase IS receiving the goods: it books the invoice and updates stock in the
// same transaction (spec workflow "Purchase Invoice -> Stock Update"). There is no separate
// draft/confirm step in this phase — see README "Known limitations".
exports.purchasesRouter.post("/", (0, auth_1.requirePermission)("purchase", "add"), (0, validate_1.validateBody)(purchase_validation_1.createPurchaseSchema), async (req, res, next) => {
    try {
        const body = req.body;
        assertBranchAccessible(req, body.branchId);
        const supplier = await prisma_1.prisma.supplier.findFirst({ where: { id: body.supplierId, tenantId: req.user.tenantId } });
        if (!supplier)
            throw new errors_1.ValidationError("Invalid supplierId for this tenant");
        const productIds = [...new Set(body.items.map((i) => i.productId))];
        const products = await prisma_1.prisma.product.findMany({ where: { id: { in: productIds }, tenantId: req.user.tenantId } });
        if (products.length !== productIds.length)
            throw new errors_1.ValidationError("One or more productIds are invalid for this tenant");
        if (body.purchaseOrderId) {
            const po = await prisma_1.prisma.purchaseOrder.findFirst({ where: { id: body.purchaseOrderId, tenantId: req.user.tenantId, branchId: body.branchId } });
            if (!po)
                throw new errors_1.ValidationError("Invalid purchaseOrderId for this branch");
        }
        const totals = (0, purchase_calc_1.computePurchaseTotals)(body.items, body.freightCharges, body.otherCharges);
        const purchase = await prisma_1.prisma.$transaction(async (tx) => {
            const referenceNumber = await (0, documentNumber_1.getNextDocumentNumber)(tx, {
                tenantId: req.user.tenantId,
                branchId: body.branchId,
                docType: "PURCHASE",
                prefix: "PUR",
            });
            const created = await tx.purchase.create({
                data: {
                    tenantId: req.user.tenantId,
                    branchId: body.branchId,
                    supplierId: body.supplierId,
                    purchaseOrderId: body.purchaseOrderId,
                    referenceNumber,
                    supplierInvoiceNumber: body.supplierInvoiceNumber,
                    purchaseDate: body.purchaseDate ?? new Date(),
                    subtotal: totals.subtotal,
                    discountAmount: totals.discountAmount,
                    taxAmount: totals.taxAmount,
                    freightCharges: body.freightCharges,
                    otherCharges: body.otherCharges,
                    totalAmount: totals.totalAmount,
                    notes: body.notes,
                    createdById: req.user.id,
                },
            });
            for (let i = 0; i < body.items.length; i++) {
                const item = body.items[i];
                const lineTotal = totals.lines[i].lineTotal;
                let batch = await tx.batch.findFirst({
                    where: { branchId: body.branchId, productId: item.productId, batchNumber: item.batchNumber },
                });
                if (!batch) {
                    batch = await tx.batch.create({
                        data: {
                            tenantId: req.user.tenantId,
                            branchId: body.branchId,
                            productId: item.productId,
                            batchNumber: item.batchNumber,
                            supplierId: body.supplierId,
                            mfgDate: item.mfgDate,
                            expiryDate: item.expiryDate,
                            purchaseRate: item.purchaseRate,
                            mrp: item.mrp,
                            gstRatePercent: item.gstRatePercent,
                            quantity: 0,
                        },
                    });
                }
                const purchaseItem = await tx.purchaseItem.create({
                    data: {
                        purchaseId: created.id,
                        productId: item.productId,
                        batchId: batch.id,
                        batchNumber: item.batchNumber,
                        mfgDate: item.mfgDate,
                        expiryDate: item.expiryDate,
                        quantity: item.quantity,
                        freeQuantity: item.freeQuantity,
                        purchaseRate: item.purchaseRate,
                        mrp: item.mrp,
                        discountPercent: item.discountPercent,
                        gstRatePercent: item.gstRatePercent,
                        lineTotal,
                    },
                });
                await (0, inventory_1.adjustStock)(tx, {
                    tenantId: req.user.tenantId,
                    branchId: body.branchId,
                    batchId: batch.id,
                    productId: item.productId,
                    quantityDelta: item.quantity + item.freeQuantity,
                    type: "PURCHASE",
                    referenceType: "Purchase",
                    referenceId: created.id,
                    createdById: req.user.id,
                });
                void purchaseItem;
            }
            if (body.purchaseOrderId) {
                await tx.purchaseOrder.update({ where: { id: body.purchaseOrderId }, data: { status: "RECEIVED" } });
            }
            return created;
        });
        const full = await prisma_1.prisma.purchase.findFirst({ where: { id: purchase.id }, include: purchaseInclude });
        (0, audit_1.recordAudit)({ req, module: "purchase", action: "create", entityType: "Purchase", entityId: purchase.id, newValue: { referenceNumber: purchase.referenceNumber, totalAmount: purchase.totalAmount }, branchId: purchase.branchId });
        res.status(201).json({ data: full });
    }
    catch (err) {
        next(err);
    }
});
exports.purchasesRouter.post("/:id/payments", (0, auth_1.requirePermission)("purchase", "edit"), (0, validate_1.validateBody)(purchase_validation_1.createPurchasePaymentSchema), async (req, res, next) => {
    try {
        const purchase = await prisma_1.prisma.purchase.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!purchase)
            throw new errors_1.NotFoundError("Purchase not found");
        assertBranchAccessible(req, purchase.branchId);
        const outstanding = Number(purchase.totalAmount) - Number(purchase.paidAmount);
        if (req.body.amount > outstanding + 0.01) {
            throw new errors_1.ValidationError(`Payment of ${req.body.amount} exceeds outstanding balance of ${outstanding.toFixed(2)}`);
        }
        const updated = await prisma_1.prisma.$transaction(async (tx) => {
            const payment = await tx.purchasePayment.create({
                data: {
                    tenantId: req.user.tenantId,
                    purchaseId: purchase.id,
                    amount: req.body.amount,
                    paymentMode: req.body.paymentMode,
                    paymentDate: req.body.paymentDate ?? new Date(),
                    referenceNumber: req.body.referenceNumber,
                    notes: req.body.notes,
                    createdById: req.user.id,
                },
            });
            const newPaidAmount = Number(purchase.paidAmount) + req.body.amount;
            await tx.purchase.update({
                where: { id: purchase.id },
                data: { paidAmount: newPaidAmount, paymentStatus: paymentStatusFor(Number(purchase.totalAmount), newPaidAmount) },
            });
            return payment;
        });
        const full = await prisma_1.prisma.purchase.findFirst({ where: { id: purchase.id }, include: purchaseInclude });
        (0, audit_1.recordAudit)({ req, module: "purchase", action: "record_payment", entityType: "Purchase", entityId: purchase.id, newValue: { amount: req.body.amount }, branchId: purchase.branchId });
        res.status(201).json({ data: full, payment: updated });
    }
    catch (err) {
        next(err);
    }
});
