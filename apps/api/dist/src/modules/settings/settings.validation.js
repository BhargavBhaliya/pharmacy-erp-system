"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSettingSchema = exports.updateBusinessProfileSchema = void 0;
const zod_1 = require("zod");
exports.updateBusinessProfileSchema = zod_1.z.object({
    businessName: zod_1.z.string().min(2).max(200).optional(),
    legalName: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().optional(),
    website: zod_1.z.string().optional(),
    gstin: zod_1.z.string().optional(),
    pan: zod_1.z.string().optional(),
    drugLicenseNumber: zod_1.z.string().optional(),
    fssaiLicenseNumber: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    state: zod_1.z.string().optional(),
    district: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    pincode: zod_1.z.string().optional(),
    invoiceFooter: zod_1.z.string().optional(),
    termsAndConditions: zod_1.z.string().optional(),
    financialYearStartMonth: zod_1.z.number().int().min(1).max(12).optional(),
});
exports.updateSettingSchema = zod_1.z.object({
    branchId: zod_1.z.string().optional(),
    value: zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean()]),
});
