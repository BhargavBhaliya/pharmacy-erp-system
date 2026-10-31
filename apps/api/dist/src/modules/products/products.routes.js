"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productsRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const products_validation_1 = require("./products.validation");
exports.productsRouter = (0, express_1.Router)();
exports.productsRouter.use(auth_1.authenticate);
const productInclude = {
    manufacturer: { select: { id: true, name: true } },
    category: { select: { id: true, name: true } },
    unit: { select: { id: true, name: true, shortCode: true } },
    barcodes: { select: { id: true, barcode: true } },
};
// The list/search endpoint (ProductsPage, POS/Inventory search, BarcodeLabelsPage) only ever
// reads manufacturer and barcodes — category and unit are shown nowhere outside the single-
// product edit form. On a remote DB (every relation is its own round trip, ~60-90ms each here)
// that's 2 unused round trips on every search-as-you-type keystroke, which is the heaviest-hit
// endpoint in the app. Full `productInclude` stays for GET /:id.
const productListInclude = {
    manufacturer: { select: { id: true, name: true } },
    barcodes: { select: { id: true, barcode: true } },
};
exports.productsRouter.get("/", (0, auth_1.requirePermission)("products", "view"), async (req, res, next) => {
    try {
        const q = products_validation_1.productQuerySchema.parse(req.query);
        const where = {
            tenantId: req.user.tenantId,
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
            prisma_1.prisma.product.count({ where }),
            prisma_1.prisma.product.findMany({
                where,
                include: productListInclude,
                orderBy: { name: "asc" },
                skip: (q.page - 1) * q.pageSize,
                take: q.pageSize,
            }),
        ]);
        res.json({ data, pagination: { page: q.page, pageSize: q.pageSize, total } });
    }
    catch (err) {
        next(err);
    }
});
exports.productsRouter.get("/:id", (0, auth_1.requirePermission)("products", "view"), async (req, res, next) => {
    try {
        const product = await prisma_1.prisma.product.findFirst({
            where: { id: req.params.id, tenantId: req.user.tenantId },
            include: productInclude,
        });
        if (!product)
            throw new errors_1.NotFoundError("Product not found");
        res.json({ data: product });
    }
    catch (err) {
        next(err);
    }
});
exports.productsRouter.post("/", (0, auth_1.requirePermission)("products", "add"), (0, validate_1.validateBody)(products_validation_1.createProductSchema), async (req, res, next) => {
    try {
        const { barcodes, ...rest } = req.body;
        const existingSku = await prisma_1.prisma.product.findFirst({ where: { tenantId: req.user.tenantId, sku: rest.sku } });
        if (existingSku)
            throw new errors_1.ConflictError("A product with this SKU already exists");
        if (barcodes.length > 0) {
            const clashing = await prisma_1.prisma.productBarcode.findFirst({ where: { barcode: { in: barcodes } } });
            if (clashing)
                throw new errors_1.ConflictError("One of the barcodes is already assigned to another product");
        }
        const product = await prisma_1.prisma.product.create({
            data: {
                ...rest,
                tenantId: req.user.tenantId,
                barcodes: { create: barcodes.map((barcode) => ({ barcode })) },
            },
            include: productInclude,
        });
        (0, audit_1.recordAudit)({ req, module: "products", action: "create", entityType: "Product", entityId: product.id, newValue: { sku: product.sku, name: product.name } });
        res.status(201).json({ data: product });
    }
    catch (err) {
        next(err);
    }
});
exports.productsRouter.put("/:id", (0, auth_1.requirePermission)("products", "edit"), (0, validate_1.validateBody)(products_validation_1.updateProductSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Product not found");
        const { barcodes, ...rest } = req.body;
        const product = await prisma_1.prisma.$transaction(async (tx) => {
            if (barcodes) {
                const clashing = await tx.productBarcode.findFirst({
                    where: { barcode: { in: barcodes }, productId: { not: existing.id } },
                });
                if (clashing)
                    throw new errors_1.ConflictError("One of the barcodes is already assigned to another product");
                await tx.productBarcode.deleteMany({ where: { productId: existing.id } });
                if (barcodes.length > 0) {
                    await tx.productBarcode.createMany({ data: barcodes.map((barcode) => ({ productId: existing.id, barcode })) });
                }
            }
            return tx.product.update({ where: { id: existing.id }, data: rest, include: productInclude });
        });
        (0, audit_1.recordAudit)({ req, module: "products", action: "update", entityType: "Product", entityId: product.id, oldValue: existing, newValue: product });
        res.json({ data: product });
    }
    catch (err) {
        next(err);
    }
});
exports.productsRouter.delete("/:id", (0, auth_1.requirePermission)("products", "delete"), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Product not found");
        const product = await prisma_1.prisma.product.update({ where: { id: existing.id }, data: { isActive: false } });
        (0, audit_1.recordAudit)({ req, module: "products", action: "deactivate", entityType: "Product", entityId: product.id, oldValue: existing });
        res.json({ data: product });
    }
    catch (err) {
        next(err);
    }
});
