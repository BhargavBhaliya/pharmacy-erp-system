import { z } from "zod";

export const createSupplierSchema = z.object({
  name: z.string().min(2).max(200),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  drugLicense: z.string().optional(),
  creditLimit: z.number().min(0).default(0),
  creditDays: z.number().int().min(0).default(0),
  openingBalance: z.number().default(0),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial().extend({ isActive: z.boolean().optional() });
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
