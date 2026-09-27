import { z } from "zod";

export const registerBusinessSchema = z.object({
  businessName: z.string().min(2).max(200),
  ownerName: z.string().min(2).max(200),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().min(6).max(20).optional(),
});
export type RegisterBusinessInput = z.infer<typeof registerBusinessSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
