import { z } from "zod";

export const openCashSessionSchema = z.object({
  branchId: z.string().min(1),
  counterId: z.string().min(1),
  openingAmount: z.number().min(0),
  notes: z.string().optional(),
});
export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;

export const closeCashSessionSchema = z.object({
  closingAmount: z.number().min(0),
  notes: z.string().optional(),
});
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;
