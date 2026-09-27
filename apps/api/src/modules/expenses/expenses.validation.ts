import { z } from "zod";

export const createExpenseCategorySchema = z.object({ name: z.string().min(1).max(200) });

export const createExpenseSchema = z.object({
  branchId: z.string().min(1),
  categoryId: z.string().min(1),
  amount: z.number().positive(),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
  expenseDate: z.coerce.date().optional(),
  description: z.string().optional(),
  receiptUrl: z.string().optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
