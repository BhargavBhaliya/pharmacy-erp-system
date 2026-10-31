"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supplierPaymentsRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const supplier_payments_validation_1 = require("./supplier-payments.validation");
exports.supplierPaymentsRouter = (0, express_1.Router)();
exports.supplierPaymentsRouter.use(auth_1.authenticate);
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
const supplierPaymentInclude = {
    supplier: { select: { id: true, name: true } },
    allocations: { include: { purchase: { select: { id: true, referenceNumber: true } } } },
};
exports.supplierPaymentsRouter.get("/", (0, auth_1.requirePermission)("purchase", "view"), async (req, res, next) => {
    try {
        const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
        const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
        const payments = await prisma_1.prisma.supplierPayment.findMany({
            where: {
                tenantId: req.user.tenantId,
                branchId: { in: req.user.branchIds },
                ...(from || to ? { paymentDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
            },
            include: supplierPaymentInclude,
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        res.json({ data: payments });
    }
    catch (err) {
        next(err);
    }
});
// A specific purchaseId pays only that invoice (rejected if it exceeds that invoice's own
// outstanding balance); otherwise this mirrors receipts.routes.ts, paying off the supplier's
// oldest unpaid purchases first. Either way it writes a PurchasePayment row per invoice touched.
exports.supplierPaymentsRouter.post("/", (0, auth_1.requirePermission)("purchase", "edit"), (0, validate_1.validateBody)(supplier_payments_validation_1.createSupplierPaymentSchema), async (req, res, next) => {
    try {
        assertBranchAccessible(req, req.body.branchId);
        const supplier = await prisma_1.prisma.supplier.findFirst({ where: { id: req.body.supplierId, tenantId: req.user.tenantId } });
        if (!supplier)
            throw new errors_1.ValidationError("Invalid supplierId for this tenant");
        let outstandingPurchases;
        if (req.body.purchaseId) {
            const purchase = await prisma_1.prisma.purchase.findFirst({ where: { id: req.body.purchaseId, tenantId: req.user.tenantId, supplierId: supplier.id } });
            if (!purchase)
                throw new errors_1.ValidationError("Invalid purchaseId for this supplier");
            const outstanding = Number(purchase.totalAmount) - Number(purchase.paidAmount);
            if (req.body.amount > outstanding + 0.01) {
                throw new errors_1.ValidationError(`Payment of ${req.body.amount} exceeds this invoice's outstanding balance of ${outstanding.toFixed(2)}`);
            }
            outstandingPurchases = [purchase];
        }
        else {
            outstandingPurchases = await prisma_1.prisma.purchase.findMany({
                where: { tenantId: req.user.tenantId, supplierId: supplier.id, status: "CONFIRMED", paymentStatus: { in: ["UNPAID", "PARTIAL"] } },
                orderBy: { createdAt: "asc" },
            });
        }
        let remaining = req.body.amount;
        const allocations = [];
        for (const purchase of outstandingPurchases) {
            if (remaining <= 0)
                break;
            const due = Number(purchase.totalAmount) - Number(purchase.paidAmount);
            const apply = Math.min(due, remaining);
            if (apply > 0) {
                allocations.push({ purchaseId: purchase.id, amount: apply });
                remaining -= apply;
            }
        }
        const unallocated = Math.round(remaining * 100) / 100;
        const supplierPayment = await prisma_1.prisma.$transaction(async (tx) => {
            for (const alloc of allocations) {
                const purchase = outstandingPurchases.find((p) => p.id === alloc.purchaseId);
                const newPaid = Number(purchase.paidAmount) + alloc.amount;
                await tx.purchasePayment.create({
                    data: {
                        tenantId: req.user.tenantId,
                        purchaseId: purchase.id,
                        amount: alloc.amount,
                        paymentMode: req.body.paymentMode,
                        referenceNumber: req.body.referenceNumber,
                        notes: "Applied from supplier payment",
                    },
                });
                await tx.purchase.update({
                    where: { id: purchase.id },
                    data: { paidAmount: newPaid, paymentStatus: newPaid >= Number(purchase.totalAmount) - 0.01 ? "PAID" : "PARTIAL" },
                });
            }
            return tx.supplierPayment.create({
                data: {
                    tenantId: req.user.tenantId,
                    branchId: req.body.branchId,
                    supplierId: supplier.id,
                    amount: req.body.amount,
                    paymentMode: req.body.paymentMode,
                    paymentDate: req.body.paymentDate,
                    referenceNumber: req.body.referenceNumber,
                    notes: req.body.notes,
                    createdById: req.user.id,
                    allocations: { create: allocations.map((a) => ({ purchaseId: a.purchaseId, amount: a.amount })) },
                },
                include: supplierPaymentInclude,
            });
        });
        (0, audit_1.recordAudit)({ req, module: "purchase", action: "supplier_payment", entityType: "SupplierPayment", entityId: supplierPayment.id, newValue: { amount: req.body.amount, unallocated }, branchId: req.body.branchId });
        res.status(201).json({ data: supplierPayment, unallocatedAmount: unallocated });
    }
    catch (err) {
        next(err);
    }
});
