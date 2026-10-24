"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStockTransferSchema = void 0;
const zod_1 = require("zod");
exports.createStockTransferSchema = zod_1.z.object({
    fromBranchId: zod_1.z.string().min(1),
    toBranchId: zod_1.z.string().min(1),
    notes: zod_1.z.string().optional(),
    items: zod_1.z
        .array(zod_1.z.object({
        productId: zod_1.z.string().min(1),
        batchId: zod_1.z.string().min(1),
        quantity: zod_1.z.number().int().positive(),
    }))
        .min(1),
});
