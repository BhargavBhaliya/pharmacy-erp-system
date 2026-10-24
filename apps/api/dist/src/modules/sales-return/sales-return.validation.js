"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSalesReturnSchema = void 0;
const zod_1 = require("zod");
exports.createSalesReturnSchema = zod_1.z.object({
    saleId: zod_1.z.string().min(1),
    reason: zod_1.z.string().optional(),
    items: zod_1.z
        .array(zod_1.z.object({
        saleItemId: zod_1.z.string().min(1),
        quantity: zod_1.z.number().int().positive(),
    }))
        .min(1),
});
