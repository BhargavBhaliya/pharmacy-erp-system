import { z } from "zod";

export const createStockTransferSchema = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        batchId: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});
export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
