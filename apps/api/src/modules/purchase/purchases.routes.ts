import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { getNextDocumentNumber } from "../../lib/documentNumber";
import { adjustStock } from "../../lib/inventory";
import { computePurchaseTotals } from "./purchase.calc";
import { createPurchasePaymentSchema, createPurchaseSchema, type CreatePurchaseInput } from "./purchase.validation";

export const purchasesRouter = Router();
purchasesRouter.use(authenticate);

const purchaseInclude = {
  supplier: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } }, batch: { select: { id: true, batchNumber: true } } } },
  payments: true,
} as const;

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

function paymentStatusFor(totalAmount: number, paidAmount: number): "UNPAID" | "PARTIAL" | "PAID" {
  if (paidAmount <= 0) return "UNPAID";
  if (paidAmount >= totalAmount) return "PAID";
  return "PARTIAL";
}

purchasesRouter.get("/", requirePermission("purchase", "view"), async (req, res, next) => {
  try {
    const purchases = await prisma.purchase.findMany({
      where: { tenantId: req.user!.tenantId, branchId: { in: req.user!.branchIds } },
      include: purchaseInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: purchases });
  } catch (err) {
    next(err);
  }
});

purchasesRouter.get("/:id", requirePermission("purchase", "view"), async (req, res, next) => {
  try {
    const purchase = await prisma.purchase.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId }, include: purchaseInclude });
    if (!purchase) throw new NotFoundError("Purchase not found");
    assertBranchAccessible(req, purchase.branchId);
    res.json({ data: purchase });
  } catch (err) {
    next(err);
  }
});

// Creating a purchase IS receiving the goods: it books the invoice and updates stock in the
// same transaction (spec workflow "Purchase Invoice -> Stock Update"). There is no separate
// draft/confirm step in this phase — see README "Known limitations".
purchasesRouter.post("/", requirePermission("purchase", "add"), validateBody(createPurchaseSchema), async (req, res, next) => {
  try {
    const body = req.body as CreatePurchaseInput;
    assertBranchAccessible(req, body.branchId);

    const supplier = await prisma.supplier.findFirst({ where: { id: body.supplierId, tenantId: req.user!.tenantId } });
    if (!supplier) throw new ValidationError("Invalid supplierId for this tenant");

    const productIds = [...new Set(body.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, tenantId: req.user!.tenantId } });
    if (products.length !== productIds.length) throw new ValidationError("One or more productIds are invalid for this tenant");

    if (body.purchaseOrderId) {
      const po = await prisma.purchaseOrder.findFirst({ where: { id: body.purchaseOrderId, tenantId: req.user!.tenantId, branchId: body.branchId } });
      if (!po) throw new ValidationError("Invalid purchaseOrderId for this branch");
    }

    const totals = computePurchaseTotals(body.items, body.freightCharges, body.otherCharges);

    const purchase = await prisma.$transaction(async (tx) => {
      const referenceNumber = await getNextDocumentNumber(tx, {
        tenantId: req.user!.tenantId,
        branchId: body.branchId,
        docType: "PURCHASE",
        prefix: "PUR",
      });

      const created = await tx.purchase.create({
        data: {
          tenantId: req.user!.tenantId,
          branchId: body.branchId,
          supplierId: body.supplierId,
          purchaseOrderId: body.purchaseOrderId,
          referenceNumber,
          supplierInvoiceNumber: body.supplierInvoiceNumber,
          purchaseDate: body.purchaseDate ?? new Date(),
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          freightCharges: body.freightCharges,
          otherCharges: body.otherCharges,
          totalAmount: totals.totalAmount,
          notes: body.notes,
          createdById: req.user!.id,
        },
      });

      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i];
        const lineTotal = totals.lines[i].lineTotal;

        let batch = await tx.batch.findFirst({
          where: { branchId: body.branchId, productId: item.productId, batchNumber: item.batchNumber },
        });
        if (!batch) {
          batch = await tx.batch.create({
            data: {
              tenantId: req.user!.tenantId,
              branchId: body.branchId,
              productId: item.productId,
              batchNumber: item.batchNumber,
              supplierId: body.supplierId,
              mfgDate: item.mfgDate,
              expiryDate: item.expiryDate,
              purchaseRate: item.purchaseRate,
              mrp: item.mrp,
              gstRatePercent: item.gstRatePercent,
              quantity: 0,
            },
          });
        }

        const purchaseItem = await tx.purchaseItem.create({
          data: {
            purchaseId: created.id,
            productId: item.productId,
            batchId: batch.id,
            batchNumber: item.batchNumber,
            mfgDate: item.mfgDate,
            expiryDate: item.expiryDate,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            purchaseRate: item.purchaseRate,
            mrp: item.mrp,
            discountPercent: item.discountPercent,
            gstRatePercent: item.gstRatePercent,
            lineTotal,
          },
        });

        await adjustStock(tx, {
          tenantId: req.user!.tenantId,
          branchId: body.branchId,
          batchId: batch.id,
          productId: item.productId,
          quantityDelta: item.quantity + item.freeQuantity,
          type: "PURCHASE",
          referenceType: "Purchase",
          referenceId: created.id,
          createdById: req.user!.id,
        });

        void purchaseItem;
      }

      if (body.purchaseOrderId) {
        await tx.purchaseOrder.update({ where: { id: body.purchaseOrderId }, data: { status: "RECEIVED" } });
      }

      return created;
    });

    const full = await prisma.purchase.findFirst({ where: { id: purchase.id }, include: purchaseInclude });
    recordAudit({ req, module: "purchase", action: "create", entityType: "Purchase", entityId: purchase.id, newValue: { referenceNumber: purchase.referenceNumber, totalAmount: purchase.totalAmount }, branchId: purchase.branchId });
    res.status(201).json({ data: full });
  } catch (err) {
    next(err);
  }
});

purchasesRouter.post(
  "/:id/payments",
  requirePermission("purchase", "edit"),
  validateBody(createPurchasePaymentSchema),
  async (req, res, next) => {
    try {
      const purchase = await prisma.purchase.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
      if (!purchase) throw new NotFoundError("Purchase not found");
      assertBranchAccessible(req, purchase.branchId);

      const outstanding = Number(purchase.totalAmount) - Number(purchase.paidAmount);
      if (req.body.amount > outstanding + 0.01) {
        throw new ValidationError(`Payment of ${req.body.amount} exceeds outstanding balance of ${outstanding.toFixed(2)}`);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const payment = await tx.purchasePayment.create({
          data: {
            tenantId: req.user!.tenantId,
            purchaseId: purchase.id,
            amount: req.body.amount,
            paymentMode: req.body.paymentMode,
            paymentDate: req.body.paymentDate ?? new Date(),
            referenceNumber: req.body.referenceNumber,
            notes: req.body.notes,
            createdById: req.user!.id,
          },
        });

        const newPaidAmount = Number(purchase.paidAmount) + req.body.amount;
        await tx.purchase.update({
          where: { id: purchase.id },
          data: { paidAmount: newPaidAmount, paymentStatus: paymentStatusFor(Number(purchase.totalAmount), newPaidAmount) },
        });

        return payment;
      });

      const full = await prisma.purchase.findFirst({ where: { id: purchase.id }, include: purchaseInclude });
      recordAudit({ req, module: "purchase", action: "record_payment", entityType: "Purchase", entityId: purchase.id, newValue: { amount: req.body.amount }, branchId: purchase.branchId });
      res.status(201).json({ data: full, payment: updated });
    } catch (err) {
      next(err);
    }
  }
);
