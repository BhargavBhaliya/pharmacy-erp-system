import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  roleId: z.string().min(1),
  branchIds: z.array(z.string()).default([]),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  phone: z.string().optional(),
  roleId: z.string().min(1).optional(),
  branchIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
