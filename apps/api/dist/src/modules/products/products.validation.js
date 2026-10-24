"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productQuerySchema = exports.updateProductSchema = exports.createProductSchema = void 0;
const zod_1 = require("zod");
exports.createProductSchema = zod_1.z.object({
    sku: zod_1.z.string().min(1).max(100),
    name: zod_1.z.string().min(1).max(300),
    genericName: zod_1.z.string().optional(),
    brandName: zod_1.z.string().optional(),
    manufacturerId: zod_1.z.string().optional(),
    categoryId: zod_1.z.string().optional(),
    unitId: zod_1.z.string().optional(),
    composition: zod_1.z.string().optional(),
    strength: zod_1.z.string().optional(),
    dosageForm: zod_1.z.string().optional(),
    hsnCode: zod_1.z.string().optional(),
    gstRatePercent: zod_1.z.number().min(0).max(100).default(0),
    scheduleType: zod_1.z.string().optional(),
    requiresPrescription: zod_1.z.boolean().default(false),
    isControlled: zod_1.z.boolean().default(false),
    isNarcotic: zod_1.z.boolean().default(false),
    isRefrigerated: zod_1.z.boolean().default(false),
    packSize: zod_1.z.string().optional(),
    mrp: zod_1.z.number().positive(),
    purchasePrice: zod_1.z.number().min(0),
    sellingPrice: zod_1.z.number().min(0),
    wholesalePrice: zod_1.z.number().min(0).optional(),
    minSellingPrice: zod_1.z.number().min(0).optional(),
    reorderLevel: zod_1.z.number().int().min(0).default(0),
    maxStockLevel: zod_1.z.number().int().min(0).optional(),
    rackLocation: zod_1.z.string().optional(),
    barcodes: zod_1.z.array(zod_1.z.string().min(1)).default([]),
});
exports.updateProductSchema = exports.createProductSchema.partial().extend({ isActive: zod_1.z.boolean().optional() });
exports.productQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(200).default(50),
    isActive: zod_1.z.coerce.boolean().optional(),
});
