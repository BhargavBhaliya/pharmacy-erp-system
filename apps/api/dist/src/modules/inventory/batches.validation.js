"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchQuerySchema = exports.updateBatchSchema = exports.createBatchSchema = void 0;
const zod_1 = require("zod");
exports.createBatchSchema = zod_1.z.object({
    branchId: zod_1.z.string().min(1),
    warehouseId: zod_1.z.string().optional(),
    productId: zod_1.z.string().min(1),
    batchNumber: zod_1.z.string().min(1).max(100),
    manufacturerId: zod_1.z.string().optional(),
    supplierId: zod_1.z.string().optional(),
    mfgDate: zod_1.z.coerce.date().optional(),
    expiryDate: zod_1.z.coerce.date(),
    purchaseRate: zod_1.z.number().min(0),
    mrp: zod_1.z.number().positive(),
    gstRatePercent: zod_1.z.number().min(0).max(100).default(0),
    quantity: zod_1.z.number().int().min(0),
    freeQuantityReceived: zod_1.z.number().int().min(0).default(0),
});
exports.updateBatchSchema = zod_1.z.object({
    mfgDate: zod_1.z.coerce.date().optional(),
    expiryDate: zod_1.z.coerce.date().optional(),
    purchaseRate: zod_1.z.number().min(0).optional(),
    mrp: zod_1.z.number().positive().optional(),
    gstRatePercent: zod_1.z.number().min(0).max(100).optional(),
    isBlocked: zod_1.z.boolean().optional(),
});
exports.batchQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().optional(),
    productId: zod_1.z.string().optional(),
    status: zod_1.z.enum(["available", "expired", "near_expiry", "all"]).default("all"),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(200).default(50),
});
