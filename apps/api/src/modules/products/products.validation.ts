import { z } from "zod";

export const createProductSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(300),
  genericName: z.string().optional(),
  brandName: z.string().optional(),
  manufacturerId: z.string().optional(),
  categoryId: z.string().optional(),
  unitId: z.string().optional(),
  composition: z.string().optional(),
  strength: z.string().optional(),
  dosageForm: z.string().optional(),
  hsnCode: z.string().optional(),
  gstRatePercent: z.number().min(0).max(100).default(0),
  scheduleType: z.string().optional(),
  requiresPrescription: z.boolean().default(false),
  isControlled: z.boolean().default(false),
  isNarcotic: z.boolean().default(false),
  isRefrigerated: z.boolean().default(false),
  packSize: z.string().optional(),
  mrp: z.number().positive(),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  wholesalePrice: z.number().min(0).optional(),
  minSellingPrice: z.number().min(0).optional(),
  reorderLevel: z.number().int().min(0).default(0),
  maxStockLevel: z.number().int().min(0).optional(),
  rackLocation: z.string().optional(),
  barcodes: z.array(z.string().min(1)).default([]),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().extend({ isActive: z.boolean().optional() });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  isActive: z.coerce.boolean().optional(),
});
