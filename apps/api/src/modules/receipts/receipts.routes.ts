import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { createReceiptSchema } from "./receipts.validation";

export const receiptsRouter = Router();
receiptsRouter.use(authenticate);

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

const receiptInclude = {
  customer: { select: { id: true, name: true } },
  allocations: { include: { sale: { select: { id: true, invoiceNumber: true } } } },
} as const;

receiptsRouter.get("/", requirePermission("payments", "view"), async (req, res, next) => {
  try {
    const receipts = await prisma.receipt.findMany({
      where: { tenantId: req.user!.tenantId, branchId: { in: req.user!.branchIds } },
      include: receiptInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ data: receipts });
  } catch (err) {
    next(err);
  }
});

// Collects a customer payment and applies it FIFO across their oldest outstanding invoices,
// writing a matching SalePayment row per invoice touched so each Sale's own paidAmount stays
// authoritative (spec sections 12 "customer ledger" / 31 "customer credit").
receiptsRouter.post("/", requirePermission("payments", "add"), validateBody(createReceiptSchema), async (req, res, next) => {
  try {
    assertBranchAccessible(req, req.body.branchId);

    const customer = await prisma.customer.findFirst({ where: { id: req.body.customerId, tenantId: req.user!.tenantId } });
    if (!customer) throw new ValidationError("Invalid customerId for this tenant");

    const outstandingSales = await prisma.sale.findMany({
      where: { tenantId: req.user!.tenantId, customerId: customer.id, status: "CONFIRMED", paymentStatus: { in: ["UNPAID", "PARTIAL"] } },
      orderBy: { createdAt: "asc" },
    });

    let remaining = req.body.amount;
    const allocations: { saleId: string; amount: number }[] = [];

    for (const sale of outstandingSales) {
      if (remaining <= 0) break;
      const due = Number(sale.totalAmount) - Number(sale.paidAmount);
      const apply = Math.min(due, remaining);
      if (apply > 0) {
        allocations.push({ saleId: sale.id, amount: apply });
        remaining -= apply;
      }
    }

    const unallocated = Math.round(remaining * 100) / 100;

    const receipt = await prisma.$transaction(async (tx) => {
      for (const alloc of allocations) {
        const sale = outstandingSales.find((s) => s.id === alloc.saleId)!;
        const newPaid = Number(sale.paidAmount) + alloc.amount;
        await tx.salePayment.create({
          data: {
            tenantId: req.user!.tenantId,
            saleId: sale.id,
            amount: alloc.amount,
            paymentMode: req.body.paymentMode,
            referenceNumber: req.body.referenceNumber,
            notes: "Applied from customer receipt",
          },
        });
        await tx.sale.update({
          where: { id: sale.id },
          data: { paidAmount: newPaid, paymentStatus: newPaid >= Number(sale.totalAmount) - 0.01 ? "PAID" : "PARTIAL" },
        });
      }

      return tx.receipt.create({
        data: {
          tenantId: req.user!.tenantId,
          branchId: req.body.branchId,
          customerId: customer.id,
          amount: req.body.amount,
          paymentMode: req.body.paymentMode,
          receiptDate: req.body.receiptDate,
          referenceNumber: req.body.referenceNumber,
          notes: req.body.notes,
          createdById: req.user!.id,
          allocations: { create: allocations.map((a) => ({ saleId: a.saleId, amount: a.amount })) },
        },
        include: receiptInclude,
      });
    });

    recordAudit({ req, module: "payments", action: "receipt", entityType: "Receipt", entityId: receipt.id, newValue: { amount: req.body.amount, unallocated }, branchId: req.body.branchId });
    res.status(201).json({ data: receipt, unallocatedAmount: unallocated });
  } catch (err) {
    next(err);
  }
});
