import { z } from "zod";

export const createSupplierPaymentSchema = z.object({
  branchId: z.string().min(1),
  supplierId: z.string().min(1),
  amount: z.number().positive(),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
  paymentDate: z.coerce.date().optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;
