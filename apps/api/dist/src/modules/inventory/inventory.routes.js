"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const inventory_1 = require("../../lib/inventory");
const inventory_validation_1 = require("./inventory.validation");
exports.inventoryRouter = (0, express_1.Router)();
exports.inventoryRouter.use(auth_1.authenticate);
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
function branchScope(req, branchId) {
    if (branchId) {
        assertBranchAccessible(req, branchId);
        return branchId;
    }
    return { in: req.user.branchIds };
}
// Batch-level stock aggregated to product level: available (sellable) vs expired quantity,
// compared against each product's reorder level. Backs both the stock view and low-stock alert.
async function aggregateStock(tenantId, branchId, productId) {
    const now = new Date();
    const baseWhere = { tenantId, branchId, ...(productId ? { productId } : {}) };
    const [availableGroups, expiredGroups] = await Promise.all([
        prisma_1.prisma.batch.groupBy({
            by: ["productId", "branchId"],
            where: { ...baseWhere, isBlocked: false, expiryDate: { gt: now } },
            _sum: { quantity: true },
        }),
        prisma_1.prisma.batch.groupBy({
            by: ["productId", "branchId"],
            where: { ...baseWhere, expiryDate: { lte: now } },
            _sum: { quantity: true },
        }),
    ]);
    const productIds = Array.from(new Set([...availableGroups, ...expiredGroups].map((g) => g.productId)));
    const products = await prisma_1.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true, reorderLevel: true, maxStockLevel: true, isActive: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    const key = (productId_, branchId_) => `${productId_}::${branchId_}`;
    const availableByKey = new Map(availableGroups.map((g) => [key(g.productId, g.branchId), g._sum.quantity ?? 0]));
    const expiredByKey = new Map(expiredGroups.map((g) => [key(g.productId, g.branchId), g._sum.quantity ?? 0]));
    const allKeys = new Set([...availableByKey.keys(), ...expiredByKey.keys()]);
    return Array.from(allKeys).map((k) => {
        const [pId, bId] = k.split("::");
        const product = productById.get(pId);
        const availableQuantity = availableByKey.get(k) ?? 0;
        const expiredQuantity = expiredByKey.get(k) ?? 0;
        return {
            productId: pId,
            branchId: bId,
            productName: product?.name ?? "Unknown",
            sku: product?.sku ?? "",
            reorderLevel: product?.reorderLevel ?? 0,
            maxStockLevel: product?.maxStockLevel ?? null,
            availableQuantity,
            expiredQuantity,
            isLowStock: (product?.reorderLevel ?? 0) > 0 && availableQuantity <= (product?.reorderLevel ?? 0),
        };
    });
}
exports.inventoryRouter.get("/stock", (0, auth_1.requirePermission)("inventory", "view"), async (req, res, next) => {
    try {
        const q = inventory_validation_1.stockQuerySchema.parse(req.query);
        const rows = await aggregateStock(req.user.tenantId, branchScope(req, q.branchId), q.productId);
        res.json({ data: rows });
    }
    catch (err) {
        next(err);
    }
});
exports.inventoryRouter.get("/low-stock", (0, auth_1.requirePermission)("inventory", "view"), async (req, res, next) => {
    try {
        const q = inventory_validation_1.stockQuerySchema.parse(req.query);
        const rows = await aggregateStock(req.user.tenantId, branchScope(req, q.branchId), q.productId);
        res.json({ data: rows.filter((r) => r.isLowStock) });
    }
    catch (err) {
        next(err);
    }
});
// Low-stock, plus a suggested reorder quantity and the supplier/rate from this product's most
// recent purchase (so "create a PO from this" needs the least possible re-typing). Purely
// advisory — doesn't create anything itself.
exports.inventoryRouter.get("/reorder-suggestions", (0, auth_1.requirePermission)("inventory", "view"), async (req, res, next) => {
    try {
        const q = inventory_validation_1.stockQuerySchema.parse(req.query);
        const tenantId = req.user.tenantId;
        const rows = (await aggregateStock(tenantId, branchScope(req, q.branchId), q.productId)).filter((r) => r.isLowStock);
        if (rows.length === 0)
            return res.json({ data: [] });
        const productIds = Array.from(new Set(rows.map((r) => r.productId)));
        const [products, recentPurchaseItems] = await Promise.all([
            prisma_1.prisma.product.findMany({
                where: { id: { in: productIds } },
                select: { id: true, isActive: true, maxStockLevel: true },
            }),
            // Ordered newest-first so the first item seen per productId below is its most recent
            // purchase — this is how we infer "the supplier/rate we'd reorder this from."
            prisma_1.prisma.purchaseItem.findMany({
                where: { productId: { in: productIds }, purchase: { tenantId, status: { not: "CANCELLED" } } },
                select: {
                    productId: true,
                    purchaseRate: true,
                    purchase: { select: { purchaseDate: true, supplier: { select: { id: true, name: true } } } },
                },
                orderBy: { purchase: { purchaseDate: "desc" } },
            }),
        ]);
        const productById = new Map(products.map((p) => [p.id, p]));
        const lastPurchaseByProduct = new Map();
        for (const item of recentPurchaseItems) {
            if (lastPurchaseByProduct.has(item.productId))
                continue;
            lastPurchaseByProduct.set(item.productId, {
                supplierId: item.purchase.supplier.id,
                supplierName: item.purchase.supplier.name,
                rate: item.purchaseRate.toString(),
            });
        }
        const data = rows
            .filter((r) => productById.get(r.productId)?.isActive !== false)
            .map((r) => {
            const maxStockLevel = productById.get(r.productId)?.maxStockLevel ?? null;
            const target = maxStockLevel ?? r.reorderLevel * 2;
            const suggestedQuantity = Math.max(target - r.availableQuantity, 1);
            const lastPurchase = lastPurchaseByProduct.get(r.productId) ?? null;
            return {
                productId: r.productId,
                productName: r.productName,
                sku: r.sku,
                branchId: r.branchId,
                currentStock: r.availableQuantity,
                reorderLevel: r.reorderLevel,
                suggestedQuantity,
                supplierId: lastPurchase?.supplierId ?? null,
                supplierName: lastPurchase?.supplierName ?? null,
                lastPurchaseRate: lastPurchase?.rate ?? null,
            };
        });
        res.json({ data });
    }
    catch (err) {
        next(err);
    }
});
exports.inventoryRouter.get("/expiry", (0, auth_1.requirePermission)("expiry", "view"), async (req, res, next) => {
    try {
        const q = inventory_validation_1.expiryQuerySchema.parse(req.query);
        const windowDays = q.windowDays ?? (await (0, inventory_1.getExpiryWarningDays)(req.user.tenantId));
        const now = new Date();
        const horizon = new Date(now.getTime() + windowDays * 86_400_000);
        const batches = await prisma_1.prisma.batch.findMany({
            where: {
                tenantId: req.user.tenantId,
                branchId: branchScope(req, q.branchId),
                quantity: { gt: 0 },
                expiryDate: { lte: horizon },
            },
            include: {
                product: { select: { id: true, name: true, sku: true } },
                branch: { select: { id: true, name: true } },
            },
            orderBy: { expiryDate: "asc" },
            take: 500,
        });
        const data = batches.map((b) => ({
            ...b,
            daysUntilExpiry: Math.ceil((b.expiryDate.getTime() - now.getTime()) / 86_400_000),
            isExpired: b.expiryDate <= now,
        }));
        res.json({
            data,
            summary: {
                windowDays,
                expiredCount: data.filter((d) => d.isExpired).length,
                nearExpiryCount: data.filter((d) => !d.isExpired).length,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
const transactionQuerySchema = zod_1.z.object({
    branchId: zod_1.z.string().optional(),
    productId: zod_1.z.string().optional(),
    batchId: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(200).default(50),
});
exports.inventoryRouter.get("/transactions", (0, auth_1.requirePermission)("inventory", "view"), async (req, res, next) => {
    try {
        const q = transactionQuerySchema.parse(req.query);
        const where = {
            tenantId: req.user.tenantId,
            branchId: branchScope(req, q.branchId),
            ...(q.productId ? { productId: q.productId } : {}),
            ...(q.batchId ? { batchId: q.batchId } : {}),
        };
        const [total, data] = await Promise.all([
            prisma_1.prisma.stockTransaction.count({ where }),
            prisma_1.prisma.stockTransaction.findMany({
                where,
                include: {
                    product: { select: { id: true, name: true, sku: true } },
                    batch: { select: { id: true, batchNumber: true } },
                },
                orderBy: { createdAt: "desc" },
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
exports.inventoryRouter.post("/adjust", (0, auth_1.requirePermission)("inventory", "stock_adjustment"), (0, validate_1.validateBody)(inventory_validation_1.adjustStockSchema), async (req, res, next) => {
    try {
        assertBranchAccessible(req, req.body.branchId);
        const batch = await prisma_1.prisma.batch.findFirst({
            where: { id: req.body.batchId, tenantId: req.user.tenantId, branchId: req.body.branchId },
        });
        if (!batch)
            throw new errors_1.ForbiddenError("Batch not found for this branch");
        const result = await prisma_1.prisma.$transaction((tx) => (0, inventory_1.adjustStock)(tx, {
            tenantId: req.user.tenantId,
            branchId: req.body.branchId,
            batchId: req.body.batchId,
            productId: batch.productId,
            quantityDelta: req.body.quantityDelta,
            type: "ADJUSTMENT",
            reason: req.body.reason,
            notes: req.body.notes,
            createdById: req.user.id,
        }));
        (0, audit_1.recordAudit)({
            req,
            module: "inventory",
            action: "stock_adjustment",
            entityType: "Batch",
            entityId: batch.id,
            newValue: { quantityDelta: req.body.quantityDelta, reason: req.body.reason, newQuantity: result.batch.quantity },
            branchId: req.body.branchId,
        });
        res.json({ data: result });
    }
    catch (err) {
        next(err);
    }
});
