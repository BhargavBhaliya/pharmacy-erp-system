"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExpenseSchema = exports.createExpenseCategorySchema = void 0;
const zod_1 = require("zod");
exports.createExpenseCategorySchema = zod_1.z.object({ name: zod_1.z.string().min(1).max(200) });
exports.createExpenseSchema = zod_1.z.object({
    branchId: zod_1.z.string().min(1),
    categoryId: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive(),
    paymentMode: zod_1.z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
    expenseDate: zod_1.z.coerce.date().optional(),
    description: zod_1.z.string().optional(),
    receiptUrl: zod_1.z.string().optional(),
});
