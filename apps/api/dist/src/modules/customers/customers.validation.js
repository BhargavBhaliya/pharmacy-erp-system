"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCustomerSchema = exports.createCustomerSchema = void 0;
const zod_1 = require("zod");
exports.createCustomerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(200),
    mobile: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    address: zod_1.z.string().optional(),
    dob: zod_1.z.coerce.date().optional(),
    gender: zod_1.z.string().optional(),
    bloodGroup: zod_1.z.string().optional(),
    doctorId: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
    creditLimit: zod_1.z.number().min(0).default(0),
    creditDays: zod_1.z.number().int().min(0).default(0),
});
exports.updateCustomerSchema = exports.createCustomerSchema.partial().extend({ isActive: zod_1.z.boolean().optional() });
