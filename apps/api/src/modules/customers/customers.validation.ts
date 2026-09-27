import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(2).max(200),
  mobile: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  dob: z.coerce.date().optional(),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  doctorId: z.string().optional(),
  notes: z.string().optional(),
  creditLimit: z.number().min(0).default(0),
  creditDays: z.number().int().min(0).default(0),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial().extend({ isActive: z.boolean().optional() });
