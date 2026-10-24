"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBranchSchema = exports.createBranchSchema = void 0;
const zod_1 = require("zod");
exports.createBranchSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(200),
    address: zod_1.z.string().optional(),
    gstin: zod_1.z.string().optional(),
    drugLicenseNumber: zod_1.z.string().optional(),
    pharmacyLicenseNumber: zod_1.z.string().optional(),
    contactNumber: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    invoicePrefix: zod_1.z.string().optional(),
    bankName: zod_1.z.string().optional(),
    bankAccountNumber: zod_1.z.string().optional(),
    bankIfsc: zod_1.z.string().optional(),
});
exports.updateBranchSchema = exports.createBranchSchema.partial().extend({
    isActive: zod_1.z.boolean().optional(),
});
