"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRoleSchema = exports.updateRolePermissionsSchema = exports.createRoleSchema = void 0;
const zod_1 = require("zod");
exports.createRoleSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100),
    discountLimitPercent: zod_1.z.number().min(0).max(100).default(0),
    permissionCodes: zod_1.z.array(zod_1.z.string()).default([]),
});
exports.updateRolePermissionsSchema = zod_1.z.object({
    permissionCodes: zod_1.z.array(zod_1.z.string()),
});
exports.updateRoleSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100).optional(),
    discountLimitPercent: zod_1.z.number().min(0).max(100).optional(),
});
