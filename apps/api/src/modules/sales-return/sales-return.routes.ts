import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { notify } from "../../lib/notify";
import { getNextDocumentNumber } from "../../lib/documentNumber";
import { adjustStock } from "../../lib/inventory";
import { createSalesReturnSchema } from "./sales-return.validation";

export const salesReturnRouter = Router();
salesReturnRouter.use(authenticate);

const returnInclude = {
  sale: { select: { id: true, invoiceNumber: true } },
  customer: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } }, batch: { select: { id: true, batchNumber: true } } } },
} as const;

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

salesReturnRouter.get("/", requirePermission("sales_return", "view"), async (req, res, next) => {
  try {
    const returns = await prisma.salesReturn.findMany({
      where: { tenantId: req.user!.tenantId, branchId: { in: req.user!.branchIds } },
      include: returnInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ data: returns });
  } catch (err) {
    next(err);
  }
});

// Applies the actual stock/refund effects of an approved return. Shared by both the
// auto-approve path (creator already has approve rights) and the explicit /approve endpoint.
async function processApproval(returnId: string, userId: string) {
  const salesReturn = await prisma.salesReturn.findUniqueOrThrow({ where: { id: returnId }, include: { items: true } });

  await prisma.$transaction(async (tx) => {
    for (const item of salesReturn.items) {
      await adjustStock(tx, {
        tenantId: salesReturn.tenantId,
        branchId: salesReturn.branchId,
        batchId: item.batchId,
        productId: item.productId,
        quantityDelta: item.quantity,
        type: "SALE_RETURN",
        referenceType: "SalesReturn",
        referenceId: salesReturn.id,
        createdById: userId,
      });
    }
    await tx.salesReturn.update({ where: { id: salesReturn.id }, data: { status: "APPROVED", approvedById: userId, refundAmount: salesReturn.totalAmount } });

    // Keep the original invoice honest: once goods are actually back on the shelf, the sale's
    // own totals should read as if the returned line was never sold, not still show the
    // original (now-overstated) amount forever. paidAmount comes down by the same amount (the
    // customer gets that value back, whether as cash-in-hand or a lower balance owed), capped at
    // 0 — never allowed to go negative or to exceed the new totalAmount.
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: salesReturn.saleId } });
    const refund = Number(salesReturn.totalAmount);
    const newTotalAmount = round2(Math.max(Number(sale.totalAmount) - refund, 0));
    const newPaidAmount = round2(Math.max(Math.min(Number(sale.paidAmount) - refund, newTotalAmount), 0));
    const newPaymentStatus = newPaidAmount <= 0 ? "UNPAID" : newPaidAmount >= newTotalAmount - 0.01 ? "PAID" : "PARTIAL";
    await tx.sale.update({
      where: { id: sale.id },
      data: { totalAmount: newTotalAmount, paidAmount: newPaidAmount, paymentStatus: newPaymentStatus },
    });
  });
}

salesReturnRouter.post("/", requirePermission("sales_return", "add"), validateBody(createSalesReturnSchema), async (req, res, next) => {
  try {
    const body = req.body as { saleId: string; reason?: string; items: { saleItemId: string; quantity: number }[] };

    const sale = await prisma.sale.findFirst({ where: { id: body.saleId, tenantId: req.user!.tenantId }, include: { items: true } });
    if (!sale) throw new ValidationError("Invalid saleId for this tenant");
    assertBranchAccessible(req, sale.branchId);
    if (sale.status === "CANCELLED") throw new ValidationError("Cannot return items from a cancelled sale");

    const saleItemById = new Map(sale.items.map((i) => [i.id, i]));

    // One grouped query covering every line in the request, instead of a separate
    // "how much of this line was already returned" lookup per item.
    const returnedGroups = await prisma.salesReturnItem.groupBy({
      by: ["saleItemId"],
      where: { saleItemId: { in: body.items.map((i) => i.saleItemId) }, salesReturn: { status: "APPROVED" } },
      _sum: { quantity: true },
    });
    const alreadyReturnedByItem = new Map(returnedGroups.map((g) => [g.saleItemId, g._sum.quantity ?? 0]));

    let totalAmount = 0;
    const itemsData: { saleItemId: string; productId: string; batchId: string; quantity: number; rate: number; lineTotal: number }[] = [];

    for (const item of body.items) {
      const saleItem = saleItemById.get(item.saleItemId);
      if (!saleItem) throw new ValidationError(`Sale item ${item.saleItemId} does not belong to this sale`);

      const alreadyReturned = alreadyReturnedByItem.get(item.saleItemId) ?? 0;
      if (alreadyReturned + item.quantity > saleItem.quantity) {
        throw new ValidationError(`Cannot return ${item.quantity}: only ${saleItem.quantity - alreadyReturned} of this line remains returnable`);
      }

      const unitRate = Number(saleItem.lineTotal) / saleItem.quantity;
      const lineTotal = round2(unitRate * item.quantity);
      totalAmount += lineTotal;
      itemsData.push({ saleItemId: item.saleItemId, productId: saleItem.productId, batchId: saleItem.batchId, quantity: item.quantity, rate: round2(unitRate), lineTotal });
    }
    totalAmount = round2(totalAmount);

    // A user who can also approve returns gets it processed immediately; otherwise it waits
    // for someone with approval rights (spec: "Do not allow unauthorized returns").
    const canAutoApprove = req.user!.permissionCodes.has("sales_return.approve");

    const created = await prisma.$transaction(async (tx) => {
      const referenceNumber = await getNextDocumentNumber(tx, {
        tenantId: req.user!.tenantId,
        branchId: sale.branchId,
        docType: "SALE_RETURN",
        prefix: "SRET",
      });

      return tx.salesReturn.create({
        data: {
          tenantId: req.user!.tenantId,
          branchId: sale.branchId,
          saleId: sale.id,
          customerId: sale.customerId,
          referenceNumber,
          reason: body.reason,
          totalAmount,
          createdById: req.user!.id,
          items: { create: itemsData },
        },
      });
    });

    if (canAutoApprove) {
      await processApproval(created.id, req.user!.id);
    } else {
      notify({ tenantId: req.user!.tenantId, type: "sales_return_pending", title: "Sales return awaiting approval", message: `${created.referenceNumber} for ₹${totalAmount} needs approval`, link: "/sales-returns" });
    }

    const full = await prisma.salesReturn.findFirst({ where: { id: created.id }, include: returnInclude });
    recordAudit({ req, module: "sales_return", action: canAutoApprove ? "create_and_approve" : "create", entityType: "SalesReturn", entityId: created.id, newValue: { referenceNumber: created.referenceNumber, totalAmount }, branchId: sale.branchId });
    res.status(201).json({ data: full });
  } catch (err) {
    next(err);
  }
});

salesReturnRouter.put("/:id/approve", requirePermission("sales_return", "approve"), async (req, res, next) => {
  try {
    const salesReturn = await prisma.salesReturn.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!salesReturn) throw new NotFoundError("Sales return not found");
    assertBranchAccessible(req, salesReturn.branchId);
    if (salesReturn.status !== "PENDING") throw new ValidationError(`Cannot approve a return in status ${salesReturn.status}`);

    await processApproval(salesReturn.id, req.user!.id);
    const full = await prisma.salesReturn.findFirst({ where: { id: salesReturn.id }, include: returnInclude });
    recordAudit({ req, module: "sales_return", action: "approve", entityType: "SalesReturn", entityId: salesReturn.id, branchId: salesReturn.branchId });
    res.json({ data: full });
  } catch (err) {
    next(err);
  }
});

salesReturnRouter.put("/:id/reject", requirePermission("sales_return", "approve"), async (req, res, next) => {
  try {
    const salesReturn = await prisma.salesReturn.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!salesReturn) throw new NotFoundError("Sales return not found");
    assertBranchAccessible(req, salesReturn.branchId);
    if (salesReturn.status !== "PENDING") throw new ValidationError(`Cannot reject a return in status ${salesReturn.status}`);

    const updated = await prisma.salesReturn.update({ where: { id: salesReturn.id }, data: { status: "REJECTED", approvedById: req.user!.id }, include: returnInclude });
    recordAudit({ req, module: "sales_return", action: "reject", entityType: "SalesReturn", entityId: salesReturn.id, branchId: salesReturn.branchId });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
