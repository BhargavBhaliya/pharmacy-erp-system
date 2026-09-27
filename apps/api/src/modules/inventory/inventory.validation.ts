import { z } from "zod";

export const adjustStockSchema = z.object({
  branchId: z.string().min(1),
  batchId: z.string().min(1),
  quantityDelta: z.number().int().refine((n) => n !== 0, "quantityDelta must not be zero"),
  reason: z.enum(["DAMAGED", "EXPIRED", "LOST", "FOUND", "CORRECTION", "OTHER"]),
  notes: z.string().optional(),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const expiryQuerySchema = z.object({
  branchId: z.string().optional(),
  windowDays: z.coerce.number().int().min(1).max(3650).optional(),
});

export const stockQuerySchema = z.object({
  branchId: z.string().optional(),
  productId: z.string().optional(),
});
