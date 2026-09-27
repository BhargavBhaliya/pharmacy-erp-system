import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { createSupplierPaymentSchema } from "./supplier-payments.validation";

export const supplierPaymentsRouter = Router();
supplierPaymentsRouter.use(authenticate);

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

const supplierPaymentInclude = {
  supplier: { select: { id: true, name: true } },
  allocations: { include: { purchase: { select: { id: true, referenceNumber: true } } } },
} as const;

supplierPaymentsRouter.get("/", requirePermission("purchase", "view"), async (req, res, next) => {
  try {
    const payments = await prisma.supplierPayment.findMany({
      where: { tenantId: req.user!.tenantId, branchId: { in: req.user!.branchIds } },
      include: supplierPaymentInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: payments });
  } catch (err) {
    next(err);
  }
});

// Mirrors receipts.routes.ts: pays off the supplier's oldest unpaid purchases first, writing a
// PurchasePayment row per invoice touched.
supplierPaymentsRouter.post("/", requirePermission("purchase", "edit"), validateBody(createSupplierPaymentSchema), async (req, res, next) => {
  try {
    assertBranchAccessible(req, req.body.branchId);

    const supplier = await prisma.supplier.findFirst({ where: { id: req.body.supplierId, tenantId: req.user!.tenantId } });
    if (!supplier) throw new ValidationError("Invalid supplierId for this tenant");

    const outstandingPurchases = await prisma.purchase.findMany({
      where: { tenantId: req.user!.tenantId, supplierId: supplier.id, status: "CONFIRMED", paymentStatus: { in: ["UNPAID", "PARTIAL"] } },
      orderBy: { createdAt: "asc" },
    });

    let remaining = req.body.amount;
    const allocations: { purchaseId: string; amount: number }[] = [];
    for (const purchase of outstandingPurchases) {
      if (remaining <= 0) break;
      const due = Number(purchase.totalAmount) - Number(purchase.paidAmount);
      const apply = Math.min(due, remaining);
      if (apply > 0) {
        allocations.push({ purchaseId: purchase.id, amount: apply });
        remaining -= apply;
      }
    }
    const unallocated = Math.round(remaining * 100) / 100;

    const supplierPayment = await prisma.$transaction(async (tx) => {
      for (const alloc of allocations) {
        const purchase = outstandingPurchases.find((p) => p.id === alloc.purchaseId)!;
        const newPaid = Number(purchase.paidAmount) + alloc.amount;
        await tx.purchasePayment.create({
          data: {
            tenantId: req.user!.tenantId,
            purchaseId: purchase.id,
            amount: alloc.amount,
            paymentMode: req.body.paymentMode,
            referenceNumber: req.body.referenceNumber,
            notes: "Applied from supplier payment",
          },
        });
        await tx.purchase.update({
          where: { id: purchase.id },
          data: { paidAmount: newPaid, paymentStatus: newPaid >= Number(purchase.totalAmount) - 0.01 ? "PAID" : "PARTIAL" },
        });
      }

      return tx.supplierPayment.create({
        data: {
          tenantId: req.user!.tenantId,
          branchId: req.body.branchId,
          supplierId: supplier.id,
          amount: req.body.amount,
          paymentMode: req.body.paymentMode,
          paymentDate: req.body.paymentDate,
          referenceNumber: req.body.referenceNumber,
          notes: req.body.notes,
          createdById: req.user!.id,
          allocations: { create: allocations.map((a) => ({ purchaseId: a.purchaseId, amount: a.amount })) },
        },
        include: supplierPaymentInclude,
      });
    });

    recordAudit({ req, module: "purchase", action: "supplier_payment", entityType: "SupplierPayment", entityId: supplierPayment.id, newValue: { amount: req.body.amount, unallocated }, branchId: req.body.branchId });
    res.status(201).json({ data: supplierPayment, unallocatedAmount: unallocated });
  } catch (err) {
    next(err);
  }
});
