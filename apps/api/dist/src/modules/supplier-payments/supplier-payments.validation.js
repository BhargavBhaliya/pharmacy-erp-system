"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupplierPaymentSchema = void 0;
const zod_1 = require("zod");
exports.createSupplierPaymentSchema = zod_1.z.object({
    branchId: zod_1.z.string().min(1),
    supplierId: zod_1.z.string().min(1),
    // When set, the payment is applied only to this purchase invoice (rejected if it exceeds that
    // invoice's own outstanding balance). When omitted, it's spread FIFO across the supplier's
    // oldest outstanding invoices, as before.
    purchaseId: zod_1.z.string().optional(),
    amount: zod_1.z.number().positive(),
    paymentMode: zod_1.z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
    paymentDate: zod_1.z.coerce.date().optional(),
    referenceNumber: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
