"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPurchaseReturnSchema = exports.createPurchasePaymentSchema = exports.createPurchaseSchema = exports.createPurchaseOrderSchema = void 0;
const zod_1 = require("zod");
exports.createPurchaseOrderSchema = zod_1.z.object({
    branchId: zod_1.z.string().min(1),
    supplierId: zod_1.z.string().min(1),
    expectedDate: zod_1.z.coerce.date().optional(),
    notes: zod_1.z.string().optional(),
    items: zod_1.z
        .array(zod_1.z.object({
        productId: zod_1.z.string().min(1),
        quantity: zod_1.z.number().int().positive(),
        rate: zod_1.z.number().min(0),
        notes: zod_1.z.string().optional(),
    }))
        .min(1),
});
const purchaseItemSchema = zod_1.z.object({
    productId: zod_1.z.string().min(1),
    batchNumber: zod_1.z.string().min(1),
    mfgDate: zod_1.z.coerce.date().optional(),
    expiryDate: zod_1.z.coerce.date(),
    quantity: zod_1.z.number().int().positive(),
    freeQuantity: zod_1.z.number().int().min(0).default(0),
    purchaseRate: zod_1.z.number().min(0),
    mrp: zod_1.z.number().positive(),
    discountPercent: zod_1.z.number().min(0).max(100).default(0),
    gstRatePercent: zod_1.z.number().min(0).max(100).default(0),
});
exports.createPurchaseSchema = zod_1.z.object({
    branchId: zod_1.z.string().min(1),
    supplierId: zod_1.z.string().min(1),
    purchaseOrderId: zod_1.z.string().optional(),
    supplierInvoiceNumber: zod_1.z.string().optional(),
    purchaseDate: zod_1.z.coerce.date().optional(),
    freightCharges: zod_1.z.number().min(0).default(0),
    otherCharges: zod_1.z.number().min(0).default(0),
    notes: zod_1.z.string().optional(),
    items: zod_1.z.array(purchaseItemSchema).min(1),
});
exports.createPurchasePaymentSchema = zod_1.z.object({
    amount: zod_1.z.number().positive(),
    paymentMode: zod_1.z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
    paymentDate: zod_1.z.coerce.date().optional(),
    referenceNumber: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
exports.createPurchaseReturnSchema = zod_1.z.object({
    purchaseId: zod_1.z.string().min(1),
    reason: zod_1.z.string().optional(),
    items: zod_1.z
        .array(zod_1.z.object({
        purchaseItemId: zod_1.z.string().min(1),
        quantity: zod_1.z.number().int().positive(),
    }))
        .min(1),
});
