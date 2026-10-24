"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stockQuerySchema = exports.expiryQuerySchema = exports.adjustStockSchema = void 0;
const zod_1 = require("zod");
exports.adjustStockSchema = zod_1.z.object({
    branchId: zod_1.z.string().min(1),
    batchId: zod_1.z.string().min(1),
    quantityDelta: zod_1.z.number().int().refine((n) => n !== 0, "quantityDelta must not be zero"),
    reason: zod_1.z.enum(["DAMAGED", "EXPIRED", "LOST", "FOUND", "CORRECTION", "OTHER"]),
    notes: zod_1.z.string().optional(),
});
exports.expiryQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().optional(),
    windowDays: zod_1.z.coerce.number().int().min(1).max(3650).optional(),
});
exports.stockQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().optional(),
    productId: zod_1.z.string().optional(),
});
