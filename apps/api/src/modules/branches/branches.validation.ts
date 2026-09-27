import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().optional(),
  gstin: z.string().optional(),
  drugLicenseNumber: z.string().optional(),
  pharmacyLicenseNumber: z.string().optional(),
  contactNumber: z.string().optional(),
  email: z.string().email().optional(),
  invoicePrefix: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfsc: z.string().optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
