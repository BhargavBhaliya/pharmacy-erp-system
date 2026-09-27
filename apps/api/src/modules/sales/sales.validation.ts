import { z } from "zod";

export const createSaleSchema = z.object({
  branchId: z.string().min(1),
  counterId: z.string().optional(),
  customerId: z.string().optional(),
  doctorId: z.string().optional(),
  prescriptionId: z.string().optional(),
  invoiceType: z.enum(["CASH", "CREDIT", "TAX", "RETAIL", "WHOLESALE"]).default("CASH"),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        sellingPrice: z.number().min(0).optional(),
        discountPercent: z.number().min(0).max(100).default(0),
      })
    )
    .min(1),
  payments: z
    .array(
      z.object({
        amount: z.number().positive(),
        paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
        referenceNumber: z.string().optional(),
      })
    )
    .default([]),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const cancelSaleSchema = z.object({
  cancelReason: z.string().min(3),
});
