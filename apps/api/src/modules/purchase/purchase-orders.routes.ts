import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { getNextDocumentNumber } from "../../lib/documentNumber";
import { createPurchaseOrderSchema } from "./purchase.validation";

export const purchaseOrdersRouter = Router();
purchaseOrdersRouter.use(authenticate);

const poInclude = {
  supplier: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
} as const;

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

purchaseOrdersRouter.get("/", requirePermission("purchase", "view"), async (req, res, next) => {
  try {
    const orders = await prisma.purchaseOrder.findMany({
      where: { tenantId: req.user!.tenantId, branchId: { in: req.user!.branchIds } },
      include: poInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: orders });
  } catch (err) {
    next(err);
  }
});

purchaseOrdersRouter.get("/:id", requirePermission("purchase", "view"), async (req, res, next) => {
  try {
    const order = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId }, include: poInclude });
    if (!order) throw new NotFoundError("Purchase order not found");
    assertBranchAccessible(req, order.branchId);
    res.json({ data: order });
  } catch (err) {
    next(err);
  }
});

purchaseOrdersRouter.post("/", requirePermission("purchase", "add"), validateBody(createPurchaseOrderSchema), async (req, res, next) => {
  try {
    assertBranchAccessible(req, req.body.branchId);

    const supplier = await prisma.supplier.findFirst({ where: { id: req.body.supplierId, tenantId: req.user!.tenantId } });
    if (!supplier) throw new ValidationError("Invalid supplierId for this tenant");

    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await getNextDocumentNumber(tx, {
        tenantId: req.user!.tenantId,
        branchId: req.body.branchId,
        docType: "PURCHASE_ORDER",
        prefix: "PO",
      });

      return tx.purchaseOrder.create({
        data: {
          tenantId: req.user!.tenantId,
          branchId: req.body.branchId,
          supplierId: req.body.supplierId,
          orderNumber,
          status: "SENT",
          expectedDate: req.body.expectedDate,
          notes: req.body.notes,
          createdById: req.user!.id,
          items: { create: req.body.items },
        },
        include: poInclude,
      });
    });

    recordAudit({ req, module: "purchase", action: "create_order", entityType: "PurchaseOrder", entityId: order.id, newValue: { orderNumber: order.orderNumber }, branchId: order.branchId });
    res.status(201).json({ data: order });
  } catch (err) {
    next(err);
  }
});

purchaseOrdersRouter.put("/:id/cancel", requirePermission("purchase", "cancel"), async (req, res, next) => {
  try {
    const order = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!order) throw new NotFoundError("Purchase order not found");
    assertBranchAccessible(req, order.branchId);
    if (order.status === "RECEIVED" || order.status === "PARTIALLY_RECEIVED") {
      throw new ValidationError("Cannot cancel a purchase order that has already received stock");
    }

    const updated = await prisma.purchaseOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" }, include: poInclude });
    recordAudit({ req, module: "purchase", action: "cancel_order", entityType: "PurchaseOrder", entityId: order.id, branchId: order.branchId });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});
