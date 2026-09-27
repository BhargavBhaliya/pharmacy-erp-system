import { z } from "zod";

export const createRoleSchema = z.object({
  name: z.string().min(2).max(100),
  discountLimitPercent: z.number().min(0).max(100).default(0),
  permissionCodes: z.array(z.string()).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string()),
});
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  discountLimitPercent: z.number().min(0).max(100).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
