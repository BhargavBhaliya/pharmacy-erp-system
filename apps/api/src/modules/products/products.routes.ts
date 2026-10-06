import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { createProductSchema, productQuerySchema, updateProductSchema } from "./products.validation";

export const productsRouter = Router();
productsRouter.use(authenticate);

const productInclude = {
  manufacturer: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, shortCode: true } },
  barcodes: { select: { id: true, barcode: true } },
} as const;

productsRouter.get("/", requirePermission("products", "view"), async (req, res, next) => {
  try {
    const q = productQuerySchema.parse(req.query);
    const where = {
      tenantId: req.user!.tenantId,
      ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
      ...(q.search
        ? {
            // No `mode: "insensitive"` — that's a Postgres/MongoDB-only Prisma option. MySQL's
            // default collation (utf8mb4_*_ci) is already case-insensitive for `contains`.
            OR: [
              { name: { contains: q.search } },
              { genericName: { contains: q.search } },
              { brandName: { contains: q.search } },
              { sku: { contains: q.search } },
              { barcodes: { some: { barcode: { contains: q.search } } } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { name: "asc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    res.json({ data, pagination: { page: q.page, pageSize: q.pageSize, total } });
  } catch (err) {
    next(err);
  }
});

productsRouter.get("/:id", requirePermission("products", "view"), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: productInclude,
    });
    if (!product) throw new NotFoundError("Product not found");
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

productsRouter.post("/", requirePermission("products", "add"), validateBody(createProductSchema), async (req, res, next) => {
  try {
    const { barcodes, ...rest } = req.body as typeof req.body;

    const existingSku = await prisma.product.findFirst({ where: { tenantId: req.user!.tenantId, sku: rest.sku } });
    if (existingSku) throw new ConflictError("A product with this SKU already exists");

    if (barcodes.length > 0) {
      const clashing = await prisma.productBarcode.findFirst({ where: { barcode: { in: barcodes } } });
      if (clashing) throw new ConflictError("One of the barcodes is already assigned to another product");
    }

    const product = await prisma.product.create({
      data: {
        ...rest,
        tenantId: req.user!.tenantId,
        barcodes: { create: barcodes.map((barcode: string) => ({ barcode })) },
      },
      include: productInclude,
    });

    recordAudit({ req, module: "products", action: "create", entityType: "Product", entityId: product.id, newValue: { sku: product.sku, name: product.name } });
    res.status(201).json({ data: product });
  } catch (err) {
    next(err);
  }
});

productsRouter.put("/:id", requirePermission("products", "edit"), validateBody(updateProductSchema), async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Product not found");

    const { barcodes, ...rest } = req.body as typeof req.body;

    const product = await prisma.$transaction(async (tx) => {
      if (barcodes) {
        const clashing = await tx.productBarcode.findFirst({
          where: { barcode: { in: barcodes }, productId: { not: existing.id } },
        });
        if (clashing) throw new ConflictError("One of the barcodes is already assigned to another product");

        await tx.productBarcode.deleteMany({ where: { productId: existing.id } });
        if (barcodes.length > 0) {
          await tx.productBarcode.createMany({ data: barcodes.map((barcode: string) => ({ productId: existing.id, barcode })) });
        }
      }
      return tx.product.update({ where: { id: existing.id }, data: rest, include: productInclude });
    });

    recordAudit({ req, module: "products", action: "update", entityType: "Product", entityId: product.id, oldValue: existing, newValue: product });
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

productsRouter.delete("/:id", requirePermission("products", "delete"), async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Product not found");

    const product = await prisma.product.update({ where: { id: existing.id }, data: { isActive: false } });
    recordAudit({ req, module: "products", action: "deactivate", entityType: "Product", entityId: product.id, oldValue: existing });
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});
