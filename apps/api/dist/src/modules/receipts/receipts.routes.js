"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiptsRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const receipts_validation_1 = require("./receipts.validation");
exports.receiptsRouter = (0, express_1.Router)();
exports.receiptsRouter.use(auth_1.authenticate);
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
const receiptInclude = {
    customer: { select: { id: true, name: true } },
    allocations: { include: { sale: { select: { id: true, invoiceNumber: true } } } },
};
exports.receiptsRouter.get("/", (0, auth_1.requirePermission)("payments", "view"), async (req, res, next) => {
    try {
        const receipts = await prisma_1.prisma.receipt.findMany({
            where: { tenantId: req.user.tenantId, branchId: { in: req.user.branchIds } },
            include: receiptInclude,
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        res.json({ data: receipts });
    }
    catch (err) {
        next(err);
    }
});
// Collects a customer payment and applies it FIFO across their oldest outstanding invoices,
// writing a matching SalePayment row per invoice touched so each Sale's own paidAmount stays
// authoritative (spec sections 12 "customer ledger" / 31 "customer credit").
exports.receiptsRouter.post("/", (0, auth_1.requirePermission)("payments", "add"), (0, validate_1.validateBody)(receipts_validation_1.createReceiptSchema), async (req, res, next) => {
    try {
        assertBranchAccessible(req, req.body.branchId);
        const customer = await prisma_1.prisma.customer.findFirst({ where: { id: req.body.customerId, tenantId: req.user.tenantId } });
        if (!customer)
            throw new errors_1.ValidationError("Invalid customerId for this tenant");
        const outstandingSales = await prisma_1.prisma.sale.findMany({
            where: { tenantId: req.user.tenantId, customerId: customer.id, status: "CONFIRMED", paymentStatus: { in: ["UNPAID", "PARTIAL"] } },
            orderBy: { createdAt: "asc" },
        });
        let remaining = req.body.amount;
        const allocations = [];
        for (const sale of outstandingSales) {
            if (remaining <= 0)
                break;
            const due = Number(sale.totalAmount) - Number(sale.paidAmount);
            const apply = Math.min(due, remaining);
            if (apply > 0) {
                allocations.push({ saleId: sale.id, amount: apply });
                remaining -= apply;
            }
        }
        const unallocated = Math.round(remaining * 100) / 100;
        const receipt = await prisma_1.prisma.$transaction(async (tx) => {
            for (const alloc of allocations) {
                const sale = outstandingSales.find((s) => s.id === alloc.saleId);
                const newPaid = Number(sale.paidAmount) + alloc.amount;
                await tx.salePayment.create({
                    data: {
                        tenantId: req.user.tenantId,
                        saleId: sale.id,
                        amount: alloc.amount,
                        paymentMode: req.body.paymentMode,
                        referenceNumber: req.body.referenceNumber,
                        notes: "Applied from customer receipt",
                    },
                });
                await tx.sale.update({
                    where: { id: sale.id },
                    data: { paidAmount: newPaid, paymentStatus: newPaid >= Number(sale.totalAmount) - 0.01 ? "PAID" : "PARTIAL" },
                });
            }
            return tx.receipt.create({
                data: {
                    tenantId: req.user.tenantId,
                    branchId: req.body.branchId,
                    customerId: customer.id,
                    amount: req.body.amount,
                    paymentMode: req.body.paymentMode,
                    receiptDate: req.body.receiptDate,
                    referenceNumber: req.body.referenceNumber,
                    notes: req.body.notes,
                    createdById: req.user.id,
                    allocations: { create: allocations.map((a) => ({ saleId: a.saleId, amount: a.amount })) },
                },
                include: receiptInclude,
            });
        });
        (0, audit_1.recordAudit)({ req, module: "payments", action: "receipt", entityType: "Receipt", entityId: receipt.id, newValue: { amount: req.body.amount, unallocated }, branchId: req.body.branchId });
        res.status(201).json({ data: receipt, unallocatedAmount: unallocated });
    }
    catch (err) {
        next(err);
    }
});
