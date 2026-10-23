import { z } from "zod";

export const createPurchaseOrderSchema = z.object({
  branchId: z.string().min(1),
  supplierId: z.string().min(1),
  expectedDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        rate: z.number().min(0),
        notes: z.string().optional(),
      })
    )
    .min(1),
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  batchNumber: z.string().min(1),
  mfgDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date(),
  quantity: z.number().int().positive(),
  freeQuantity: z.number().int().min(0).default(0),
  purchaseRate: z.number().min(0),
  mrp: z.number().positive(),
  discountPercent: z.number().min(0).max(100).default(0),
  gstRatePercent: z.number().min(0).max(100).default(0),
});

export const createPurchaseSchema = z.object({
  branchId: z.string().min(1),
  supplierId: z.string().min(1),
  purchaseOrderId: z.string().optional(),
  supplierInvoiceNumber: z.string().optional(),
  purchaseDate: z.coerce.date().optional(),
  freightCharges: z.number().min(0).default(0),
  otherCharges: z.number().min(0).default(0),
  notes: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1),
});
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

export const createPurchasePaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
  paymentDate: z.coerce.date().optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});
export type CreatePurchasePaymentInput = z.infer<typeof createPurchasePaymentSchema>;

export const createPurchaseReturnSchema = z.object({
  purchaseId: z.string().min(1),
  reason: z.string().optional(),
  items: z
    .array(
      z.object({
        purchaseItemId: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});
export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;
