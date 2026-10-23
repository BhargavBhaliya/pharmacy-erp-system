import { z } from "zod";

export const registerBusinessSchema = z.object({
  businessName: z.string().min(2).max(200),
  ownerName: z.string().min(2).max(200),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().min(6).max(20).optional(),
});
export type RegisterBusinessInput = z.infer<typeof registerBusinessSchema>;

// Field is still called "email" for API-compatibility (existing clients/tests), but it now
// accepts a username too — the service looks up both in one query, so the caller never needs
// to say which kind this is. Validation is deliberately NOT .email() anymore since a username
// won't pass that shape.
export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
