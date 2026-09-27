import { z } from "zod";

export const createSalesReturnSchema = z.object({
  saleId: z.string().min(1),
  reason: z.string().optional(),
  items: z
    .array(
      z.object({
        saleItemId: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});
export type CreateSalesReturnInput = z.infer<typeof createSalesReturnSchema>;
