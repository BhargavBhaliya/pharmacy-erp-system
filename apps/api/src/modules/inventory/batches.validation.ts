import { z } from "zod";

export const createBatchSchema = z.object({
  branchId: z.string().min(1),
  warehouseId: z.string().optional(),
  productId: z.string().min(1),
  batchNumber: z.string().min(1).max(100),
  manufacturerId: z.string().optional(),
  supplierId: z.string().optional(),
  mfgDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date(),
  purchaseRate: z.number().min(0),
  mrp: z.number().positive(),
  gstRatePercent: z.number().min(0).max(100).default(0),
  quantity: z.number().int().min(0),
  freeQuantityReceived: z.number().int().min(0).default(0),
});
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

export const updateBatchSchema = z.object({
  mfgDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  purchaseRate: z.number().min(0).optional(),
  mrp: z.number().positive().optional(),
  gstRatePercent: z.number().min(0).max(100).optional(),
  isBlocked: z.boolean().optional(),
});
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;

export const batchQuerySchema = z.object({
  branchId: z.string().optional(),
  productId: z.string().optional(),
  status: z.enum(["available", "expired", "near_expiry", "all"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
