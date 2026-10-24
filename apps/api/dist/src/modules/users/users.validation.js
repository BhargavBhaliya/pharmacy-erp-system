"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePasswordSchema = exports.updateUserSchema = exports.createUserSchema = void 0;
const zod_1 = require("zod");
const usernameSchema = zod_1.z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores");
exports.createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(200),
    email: zod_1.z.string().email(),
    // Optional: auto-generated from the name if left blank, but an admin can set a specific one.
    username: usernameSchema.optional(),
    phone: zod_1.z.string().optional(),
    password: zod_1.z.string().min(8),
    roleId: zod_1.z.string().min(1),
    branchIds: zod_1.z.array(zod_1.z.string()).default([]),
});
exports.updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(200).optional(),
    username: usernameSchema.optional(),
    phone: zod_1.z.string().optional(),
    roleId: zod_1.z.string().min(1).optional(),
    branchIds: zod_1.z.array(zod_1.z.string()).optional(),
    isActive: zod_1.z.boolean().optional(),
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8),
});
