"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSupplierSchema = exports.createSupplierSchema = void 0;
const zod_1 = require("zod");
exports.createSupplierSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(200),
    contactPerson: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    address: zod_1.z.string().optional(),
    gstin: zod_1.z.string().optional(),
    pan: zod_1.z.string().optional(),
    drugLicense: zod_1.z.string().optional(),
    creditLimit: zod_1.z.number().min(0).default(0),
    creditDays: zod_1.z.number().int().min(0).default(0),
    openingBalance: zod_1.z.number().default(0),
});
exports.updateSupplierSchema = exports.createSupplierSchema.partial().extend({ isActive: zod_1.z.boolean().optional() });
