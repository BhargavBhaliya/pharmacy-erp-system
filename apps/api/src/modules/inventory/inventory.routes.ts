import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { adjustStock, getExpiryWarningDays } from "../../lib/inventory";
import { adjustStockSchema, expiryQuerySchema, stockQuerySchema } from "./inventory.validation";

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

function branchScope(req: import("express").Request, branchId?: string) {
  if (branchId) {
    assertBranchAccessible(req, branchId);
    return branchId;
  }
  return { in: req.user!.branchIds };
}

// Batch-level stock aggregated to product level: available (sellable) vs expired quantity,
// compared against each product's reorder level. Backs both the stock view and low-stock alert.
async function aggregateStock(tenantId: string, branchId: ReturnType<typeof branchScope>, productId?: string) {
  const now = new Date();
  const baseWhere = { tenantId, branchId, ...(productId ? { productId } : {}) };

  const [availableGroups, expiredGroups] = await Promise.all([
    prisma.batch.groupBy({
      by: ["productId", "branchId"],
      where: { ...baseWhere, isBlocked: false, expiryDate: { gt: now } },
      _sum: { quantity: true },
    }),
    prisma.batch.groupBy({
      by: ["productId", "branchId"],
      where: { ...baseWhere, expiryDate: { lte: now } },
      _sum: { quantity: true },
    }),
  ]);

  const productIds = Array.from(new Set([...availableGroups, ...expiredGroups].map((g) => g.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true, reorderLevel: true, maxStockLevel: true, isActive: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const key = (productId_: string, branchId_: string) => `${productId_}::${branchId_}`;
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

inventoryRouter.get("/stock", requirePermission("inventory", "view"), async (req, res, next) => {
  try {
    const q = stockQuerySchema.parse(req.query);
    const rows = await aggregateStock(req.user!.tenantId, branchScope(req, q.branchId), q.productId);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get("/low-stock", requirePermission("inventory", "view"), async (req, res, next) => {
  try {
    const q = stockQuerySchema.parse(req.query);
    const rows = await aggregateStock(req.user!.tenantId, branchScope(req, q.branchId), q.productId);
    res.json({ data: rows.filter((r) => r.isLowStock) });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get("/expiry", requirePermission("expiry", "view"), async (req, res, next) => {
  try {
    const q = expiryQuerySchema.parse(req.query);
    const windowDays = q.windowDays ?? (await getExpiryWarningDays(req.user!.tenantId));
    const now = new Date();
    const horizon = new Date(now.getTime() + windowDays * 86_400_000);

    const batches = await prisma.batch.findMany({
      where: {
        tenantId: req.user!.tenantId,
        branchId: branchScope(req, q.branchId),
        quantity: { gt: 0 },
        expiryDate: { lte: horizon },
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: "asc" },
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
  } catch (err) {
    next(err);
  }
});

const transactionQuerySchema = z.object({
  branchId: z.string().optional(),
  productId: z.string().optional(),
  batchId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

inventoryRouter.get("/transactions", requirePermission("inventory", "view"), async (req, res, next) => {
  try {
    const q = transactionQuerySchema.parse(req.query);
    const where = {
      tenantId: req.user!.tenantId,
      branchId: branchScope(req, q.branchId),
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.batchId ? { batchId: q.batchId } : {}),
    };

    const [total, data] = await Promise.all([
      prisma.stockTransaction.count({ where }),
      prisma.stockTransaction.findMany({
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
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post(
  "/adjust",
  requirePermission("inventory", "stock_adjustment"),
  validateBody(adjustStockSchema),
  async (req, res, next) => {
    try {
      assertBranchAccessible(req, req.body.branchId);

      const batch = await prisma.batch.findFirst({
        where: { id: req.body.batchId, tenantId: req.user!.tenantId, branchId: req.body.branchId },
      });
      if (!batch) throw new ForbiddenError("Batch not found for this branch");

      const result = await prisma.$transaction((tx) =>
        adjustStock(tx, {
          tenantId: req.user!.tenantId,
          branchId: req.body.branchId,
          batchId: req.body.batchId,
          productId: batch.productId,
          quantityDelta: req.body.quantityDelta,
          type: "ADJUSTMENT",
          reason: req.body.reason,
          notes: req.body.notes,
          createdById: req.user!.id,
        })
      );

      recordAudit({
        req,
        module: "inventory",
        action: "stock_adjustment",
        entityType: "Batch",
        entityId: batch.id,
        newValue: { quantityDelta: req.body.quantityDelta, reason: req.body.reason, newQuantity: result.batch.quantity },
        branchId: req.body.branchId,
      });

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);
