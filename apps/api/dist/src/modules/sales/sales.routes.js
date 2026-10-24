"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.salesRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const documentNumber_1 = require("../../lib/documentNumber");
const inventory_1 = require("../../lib/inventory");
const customerCredit_1 = require("../../lib/customerCredit");
const sales_calc_1 = require("./sales.calc");
const sales_validation_1 = require("./sales.validation");
exports.salesRouter = (0, express_1.Router)();
exports.salesRouter.use(auth_1.authenticate);
const saleInclude = {
    customer: { select: { id: true, name: true, mobile: true, email: true, address: true, creditLimit: true } },
    doctor: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true, invoicePrefix: true, gstin: true, address: true, contactNumber: true } },
    items: { include: { product: { select: { id: true, name: true, sku: true, hsnCode: true } }, batch: { select: { id: true, batchNumber: true, expiryDate: true } } } },
    payments: true,
};
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
exports.salesRouter.get("/", (0, auth_1.requirePermission)("sales", "view"), async (req, res, next) => {
    try {
        const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
        const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
        const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
        const sales = await prisma_1.prisma.sale.findMany({
            where: {
                tenantId: req.user.tenantId,
                branchId: { in: req.user.branchIds },
                ...(customerId ? { customerId } : {}),
                ...(from || to ? { saleDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
            },
            include: saleInclude,
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        res.json({ data: sales });
    }
    catch (err) {
        next(err);
    }
});
// Lets the billing screen offer a manufacturer/batch choice when a product has stock from
// more than one batch (e.g. two different manufacturers) instead of always auto-picking FEFO.
exports.salesRouter.get("/available-batches", (0, auth_1.requirePermission)("pos", "add"), async (req, res, next) => {
    try {
        const productId = typeof req.query.productId === "string" ? req.query.productId : undefined;
        const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
        if (!productId || !branchId)
            throw new errors_1.ValidationError("productId and branchId are required");
        assertBranchAccessible(req, branchId);
        const batches = await prisma_1.prisma.batch.findMany({
            where: {
                tenantId: req.user.tenantId,
                branchId,
                productId,
                quantity: { gt: 0 },
                isBlocked: false,
                expiryDate: { gt: new Date() },
            },
            include: { manufacturer: { select: { id: true, name: true } } },
            orderBy: { expiryDate: "asc" },
        });
        res.json({ data: batches });
    }
    catch (err) {
        next(err);
    }
});
exports.salesRouter.get("/:id", (0, auth_1.requirePermission)("sales", "view"), async (req, res, next) => {
    try {
        const sale = await prisma_1.prisma.sale.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: saleInclude });
        if (!sale)
            throw new errors_1.NotFoundError("Sale not found");
        assertBranchAccessible(req, sale.branchId);
        res.json({ data: sale });
    }
    catch (err) {
        next(err);
    }
});
// The core POS endpoint: prices the basket, allocates stock across FEFO batches (may span
// several batches per line), enforces discount limits and customer credit limits, then books
// the invoice and reduces stock atomically.
exports.salesRouter.post("/", (0, auth_1.requirePermission)("pos", "add"), (0, validate_1.validateBody)(sales_validation_1.createSaleSchema), async (req, res, next) => {
    try {
        const body = req.body;
        assertBranchAccessible(req, body.branchId);
        for (const item of body.items) {
            if (item.discountPercent > req.user.discountLimitPercent) {
                throw new errors_1.ForbiddenError(`Discount of ${item.discountPercent}% exceeds your permitted limit of ${req.user.discountLimitPercent}%`);
            }
        }
        const productIds = [...new Set(body.items.map((i) => i.productId))];
        const products = await prisma_1.prisma.product.findMany({ where: { id: { in: productIds }, tenantId: req.user.tenantId } });
        if (products.length !== productIds.length)
            throw new errors_1.ValidationError("One or more productIds are invalid for this tenant");
        const productById = new Map(products.map((p) => [p.id, p]));
        // A client-supplied sellingPrice can't be trusted below the product's configured floor —
        // without this, any POS caller (not just the UI) could sell at an arbitrary price regardless
        // of the role's discount limit.
        for (const item of body.items) {
            const product = productById.get(item.productId);
            if (item.sellingPrice === undefined || product.minSellingPrice === null)
                continue;
            const floor = Number(product.minSellingPrice);
            if (item.sellingPrice < floor) {
                throw new errors_1.ForbiddenError(`Selling price ₹${item.sellingPrice} for ${product.name} is below the minimum allowed price ₹${floor}`);
            }
        }
        let customer = null;
        if (body.customerId) {
            customer = await prisma_1.prisma.customer.findFirst({ where: { id: body.customerId, tenantId: req.user.tenantId } });
            if (!customer)
                throw new errors_1.ValidationError("Invalid customerId for this tenant");
        }
        const paidNow = body.payments.reduce((sum, p) => sum + p.amount, 0);
        const sale = await prisma_1.prisma.$transaction(async (tx) => {
            const lineResults = [];
            for (const item of body.items) {
                const product = productById.get(item.productId);
                const sellingPrice = item.sellingPrice ?? Number(product.sellingPrice);
                const allocations = item.batchId
                    ? await (0, inventory_1.allocateSpecificBatch)(tx, {
                        tenantId: req.user.tenantId,
                        branchId: body.branchId,
                        productId: item.productId,
                        batchId: item.batchId,
                        quantity: item.quantity,
                    })
                    : await (0, inventory_1.allocateFefoQuantity)(tx, {
                        tenantId: req.user.tenantId,
                        branchId: body.branchId,
                        productId: item.productId,
                        quantity: item.quantity,
                    });
                for (const alloc of allocations) {
                    const totals = (0, sales_calc_1.computeSaleLineTotals)({
                        quantity: alloc.quantity,
                        sellingPrice,
                        discountPercent: item.discountPercent,
                        gstRatePercent: alloc.gstRatePercent,
                    });
                    lineResults.push({
                        productId: item.productId,
                        batchId: alloc.batchId,
                        quantity: alloc.quantity,
                        sellingPrice,
                        discountPercent: item.discountPercent,
                        gstRatePercent: alloc.gstRatePercent,
                        mrp: alloc.mrp,
                        lineTotal: totals.lineTotal,
                    });
                    await (0, inventory_1.adjustStock)(tx, {
                        tenantId: req.user.tenantId,
                        branchId: body.branchId,
                        batchId: alloc.batchId,
                        productId: item.productId,
                        quantityDelta: -alloc.quantity,
                        type: "SALE",
                        createdById: req.user.id,
                    });
                }
            }
            const subtotal = lineResults.reduce((sum, l) => sum + (l.quantity * l.sellingPrice * (100 - l.discountPercent)) / 100, 0);
            const discountAmount = lineResults.reduce((sum, l) => sum + (l.quantity * l.sellingPrice * l.discountPercent) / 100, 0);
            const taxAmount = lineResults.reduce((sum, l) => sum + (l.lineTotal - (l.quantity * l.sellingPrice * (100 - l.discountPercent)) / 100), 0);
            const totalAmount = round2(lineResults.reduce((sum, l) => sum + l.lineTotal, 0));
            if (body.invoiceType === "CREDIT" && customer) {
                const outstanding = await (0, customerCredit_1.getCustomerOutstanding)(tx, customer.id);
                const projected = outstanding + totalAmount - paidNow;
                if (projected > Number(customer.creditLimit)) {
                    throw new errors_1.ValidationError(`This sale would push ${customer.name}'s outstanding balance to ${projected.toFixed(2)}, exceeding their credit limit of ${customer.creditLimit}`);
                }
            }
            else if (paidNow < totalAmount - 0.01 && body.invoiceType !== "CREDIT") {
                throw new errors_1.ValidationError(`Payment total ${paidNow} does not cover invoice total ${totalAmount.toFixed(2)} for a non-credit sale`);
            }
            const branch = await tx.branch.findUniqueOrThrow({ where: { id: body.branchId } });
            const invoiceNumber = await (0, documentNumber_1.getNextDocumentNumber)(tx, {
                tenantId: req.user.tenantId,
                branchId: body.branchId,
                docType: "SALE",
                prefix: branch.invoicePrefix || "INV",
            });
            const paymentStatus = paidNow <= 0 ? "UNPAID" : paidNow >= totalAmount - 0.01 ? "PAID" : "PARTIAL";
            const created = await tx.sale.create({
                data: {
                    tenantId: req.user.tenantId,
                    branchId: body.branchId,
                    counterId: body.counterId,
                    customerId: body.customerId,
                    doctorId: body.doctorId,
                    prescriptionId: body.prescriptionId,
                    invoiceNumber,
                    invoiceType: body.invoiceType,
                    subtotal: round2(subtotal),
                    discountAmount: round2(discountAmount),
                    taxAmount: round2(taxAmount),
                    totalAmount,
                    paidAmount: paidNow,
                    paymentStatus,
                    createdById: req.user.id,
                    items: {
                        create: lineResults.map((l) => ({
                            productId: l.productId,
                            batchId: l.batchId,
                            quantity: l.quantity,
                            mrp: l.mrp,
                            sellingPrice: l.sellingPrice,
                            discountPercent: l.discountPercent,
                            gstRatePercent: l.gstRatePercent,
                            lineTotal: l.lineTotal,
                        })),
                    },
                    payments: { create: body.payments.map((p) => ({ tenantId: req.user.tenantId, ...p })) },
                },
            });
            return created;
        });
        const full = await prisma_1.prisma.sale.findFirst({ where: { id: sale.id }, include: saleInclude });
        (0, audit_1.recordAudit)({ req, module: "sales", action: "create", entityType: "Sale", entityId: sale.id, newValue: { invoiceNumber: sale.invoiceNumber, totalAmount: sale.totalAmount }, branchId: sale.branchId });
        res.status(201).json({ data: full });
    }
    catch (err) {
        next(err);
    }
});
exports.salesRouter.put("/:id/cancel", (0, auth_1.requirePermission)("sales", "cancel"), (0, validate_1.validateBody)(sales_validation_1.cancelSaleSchema), async (req, res, next) => {
    try {
        const sale = await prisma_1.prisma.sale.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { items: true } });
        if (!sale)
            throw new errors_1.NotFoundError("Sale not found");
        assertBranchAccessible(req, sale.branchId);
        if (sale.status === "CANCELLED")
            throw new errors_1.ValidationError("Sale is already cancelled");
        await prisma_1.prisma.$transaction(async (tx) => {
            for (const item of sale.items) {
                await (0, inventory_1.adjustStock)(tx, {
                    tenantId: req.user.tenantId,
                    branchId: sale.branchId,
                    batchId: item.batchId,
                    productId: item.productId,
                    quantityDelta: item.quantity,
                    type: "SALE_RETURN",
                    referenceType: "SaleCancellation",
                    referenceId: sale.id,
                    createdById: req.user.id,
                });
            }
            // Cancelled sales are kept (never deleted) with their reason, per spec 55.10.
            await tx.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED", cancelReason: req.body.cancelReason } });
        });
        const full = await prisma_1.prisma.sale.findFirst({ where: { id: sale.id }, include: saleInclude });
        (0, audit_1.recordAudit)({ req, module: "sales", action: "cancel", entityType: "Sale", entityId: sale.id, newValue: { cancelReason: req.body.cancelReason }, branchId: sale.branchId });
        res.json({ data: full });
    }
    catch (err) {
        next(err);
    }
});
function round2(n) {
    return Math.round(n * 100) / 100;
}
