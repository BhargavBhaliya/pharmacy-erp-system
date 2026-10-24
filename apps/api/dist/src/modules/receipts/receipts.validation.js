"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReceiptSchema = void 0;
const zod_1 = require("zod");
exports.createReceiptSchema = zod_1.z.object({
    branchId: zod_1.z.string().min(1),
    customerId: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive(),
    paymentMode: zod_1.z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
    receiptDate: zod_1.z.coerce.date().optional(),
    referenceNumber: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
