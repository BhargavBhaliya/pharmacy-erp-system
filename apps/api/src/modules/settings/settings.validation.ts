import { z } from "zod";

export const updateBusinessProfileSchema = z.object({
  businessName: z.string().min(2).max(200).optional(),
  legalName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  whatsappNumber: z.string().optional(),
  drugLicenseNumber: z.string().optional(),
  fssaiLicenseNumber: z.string().optional(),
  address: z.string().optional(),
  state: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  pincode: z.string().optional(),
  invoiceFooter: z.string().optional(),
  termsAndConditions: z.string().optional(),
  financialYearStartMonth: z.number().int().min(1).max(12).optional(),
});

export const updateSettingSchema = z.object({
  branchId: z.string().optional(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
