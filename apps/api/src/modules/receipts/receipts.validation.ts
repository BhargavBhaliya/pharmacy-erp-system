import { z } from "zod";

export const createReceiptSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().min(1),
  amount: z.number().positive(),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
  receiptDate: z.coerce.date().optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
