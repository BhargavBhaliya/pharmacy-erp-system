"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeCashSessionSchema = exports.openCashSessionSchema = void 0;
const zod_1 = require("zod");
exports.openCashSessionSchema = zod_1.z.object({
    branchId: zod_1.z.string().min(1),
    counterId: zod_1.z.string().min(1),
    openingAmount: zod_1.z.number().min(0),
    notes: zod_1.z.string().optional(),
});
exports.closeCashSessionSchema = zod_1.z.object({
    closingAmount: zod_1.z.number().min(0),
    notes: zod_1.z.string().optional(),
});
