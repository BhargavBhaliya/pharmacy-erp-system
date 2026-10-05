import { z } from "zod";

export const createPrescriptionSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().min(1),
  doctorId: z.string().optional(),
  prescriptionDate: z.coerce.date().optional(),
  prescriptionNumber: z.string().optional(),
  imageUrl: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().optional(),
        medicineName: z.string().min(1),
        dose: z.string().optional(),
        frequency: z.string().optional(),
        duration: z.string().optional(),
        instructions: z.string().optional(),
      })
    )
    .default([]),
});
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;

export const updatePrescriptionSchema = createPrescriptionSchema.partial().extend({
  customerId: z.string().min(1).optional(),
});
export type UpdatePrescriptionInput = z.infer<typeof updatePrescriptionSchema>;
