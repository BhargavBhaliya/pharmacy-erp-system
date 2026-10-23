import { z } from "zod";

export const createSupplierPaymentSchema = z.object({
  branchId: z.string().min(1),
  supplierId: z.string().min(1),
  // When set, the payment is applied only to this purchase invoice (rejected if it exceeds that
  // invoice's own outstanding balance). When omitted, it's spread FIFO across the supplier's
  // oldest outstanding invoices, as before.
  purchaseId: z.string().optional(),
  amount: z.number().positive(),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
  paymentDate: z.coerce.date().optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;
