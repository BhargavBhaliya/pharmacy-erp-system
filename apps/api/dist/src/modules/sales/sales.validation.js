"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelSaleSchema = exports.createSaleSchema = void 0;
const zod_1 = require("zod");
exports.createSaleSchema = zod_1.z.object({
    branchId: zod_1.z.string().min(1),
    counterId: zod_1.z.string().optional(),
    customerId: zod_1.z.string().optional(),
    doctorId: zod_1.z.string().optional(),
    prescriptionId: zod_1.z.string().optional(),
    invoiceType: zod_1.z.enum(["CASH", "CREDIT", "TAX", "RETAIL", "WHOLESALE"]).default("CASH"),
    items: zod_1.z
        .array(zod_1.z.object({
        productId: zod_1.z.string().min(1),
        batchId: zod_1.z.string().optional(),
        quantity: zod_1.z.number().int().positive(),
        sellingPrice: zod_1.z.number().min(0).optional(),
        discountPercent: zod_1.z.number().min(0).max(100).default(0),
    }))
        .min(1),
    payments: zod_1.z
        .array(zod_1.z.object({
        amount: zod_1.z.number().positive(),
        paymentMode: zod_1.z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
        referenceNumber: zod_1.z.string().optional(),
    }))
        .default([]),
});
exports.cancelSaleSchema = zod_1.z.object({
    cancelReason: zod_1.z.string().min(3),
});
