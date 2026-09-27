import { z } from "zod";

export const createDoctorSchema = z.object({
  name: z.string().min(2).max(200),
  registrationNumber: z.string().optional(),
  specialization: z.string().optional(),
  hospitalClinic: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
});
export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;

export const updateDoctorSchema = createDoctorSchema.partial().extend({ isActive: z.boolean().optional() });
