import { z } from "zod";

export const platformLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;

export const createStoreSchema = z.object({
  businessName: z.string().min(2).max(200),
  ownerName: z.string().min(2).max(200),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().min(6).max(20).optional(),
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = z.object({
  businessName: z.string().min(2).max(200).optional(),
  legalName: z.string().optional(),
  ownerName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  drugLicenseNumber: z.string().optional(),
  fssaiLicenseNumber: z.string().optional(),
  address: z.string().optional(),
  state: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  pincode: z.string().optional(),
});
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

export const listStoresQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListStoresQuery = z.infer<typeof listStoresQuerySchema>;

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters").optional(),
});
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;

export const upsertSubscriptionSchema = z.object({
  planName: z.string().min(1).max(100).default("Standard"),
  billingCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  amount: z.number().min(0),
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"]).default("TRIAL"),
  nextDueDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});
export type UpsertSubscriptionInput = z.infer<typeof upsertSubscriptionSchema>;

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  // When true (default), pushes the subscription's nextDueDate forward by one billing cycle
  // and marks it ACTIVE — the normal "they paid, extend them" flow.
  extendDueDate: z.boolean().default(true),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
