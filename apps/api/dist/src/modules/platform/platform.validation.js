"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkStoreActionSchema = exports.createStoreNoteSchema = exports.recordPaymentSchema = exports.upsertSubscriptionSchema = exports.resetUserPasswordSchema = exports.listStoresQuerySchema = exports.updateStoreSchema = exports.createStoreSchema = exports.changePlatformAdminPasswordSchema = exports.updatePlatformAdminSchema = exports.platformLoginSchema = void 0;
const zod_1 = require("zod");
// Field is still called "email" for API-compatibility, but it now accepts a username too —
// same approach as the tenant login (see auth.validation.ts).
exports.platformLoginSchema = zod_1.z.object({
    email: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1),
});
exports.updatePlatformAdminSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(200).optional(),
    email: zod_1.z.string().email().optional(),
    username: zod_1.z
        .string()
        .min(3)
        .max(30)
        .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores")
        .optional(),
});
exports.changePlatformAdminPasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8, "Password must be at least 8 characters"),
});
exports.createStoreSchema = zod_1.z.object({
    businessName: zod_1.z.string().min(2).max(200),
    ownerName: zod_1.z.string().min(2).max(200),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
    phone: zod_1.z.string().min(6).max(20).optional(),
});
exports.updateStoreSchema = zod_1.z.object({
    businessName: zod_1.z.string().min(2).max(200).optional(),
    legalName: zod_1.z.string().optional(),
    ownerName: zod_1.z.string().optional(),
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
});
exports.listStoresQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    isActive: zod_1.z.coerce.boolean().optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(200).default(50),
});
exports.resetUserPasswordSchema = zod_1.z.object({
    newPassword: zod_1.z.string().min(8, "Password must be at least 8 characters").optional(),
});
exports.upsertSubscriptionSchema = zod_1.z.object({
    planName: zod_1.z.string().min(1).max(100).default("Standard"),
    billingCycle: zod_1.z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
    amount: zod_1.z.number().min(0),
    status: zod_1.z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"]).default("TRIAL"),
    nextDueDate: zod_1.z.coerce.date().optional(),
    notes: zod_1.z.string().optional(),
});
exports.recordPaymentSchema = zod_1.z.object({
    amount: zod_1.z.number().positive(),
    paymentMode: zod_1.z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "CREDIT", "OTHER"]),
    referenceNumber: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
    // When true (default), pushes the subscription's nextDueDate forward by one billing cycle
    // and marks it ACTIVE — the normal "they paid, extend them" flow.
    extendDueDate: zod_1.z.boolean().default(true),
});
exports.createStoreNoteSchema = zod_1.z.object({
    note: zod_1.z.string().min(1).max(4000),
});
exports.bulkStoreActionSchema = zod_1.z.object({
    tenantIds: zod_1.z.array(zod_1.z.string().min(1)).min(1).max(200),
});
