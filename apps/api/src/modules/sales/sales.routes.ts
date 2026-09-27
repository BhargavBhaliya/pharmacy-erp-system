import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { getNextDocumentNumber } from "../../lib/documentNumber";
import { adjustStock, allocateFefoQuantity } from "../../lib/inventory";
import { getCustomerOutstanding } from "../../lib/customerCredit";
import { computeSaleLineTotals } from "./sales.calc";
import { cancelSaleSchema, createSaleSchema, type CreateSaleInput } from "./sales.validation";

export const salesRouter = Router();
salesRouter.use(authenticate);

const saleInclude = {
  customer: { select: { id: true, name: true, mobile: true, creditLimit: true } },
  doctor: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true, invoicePrefix: true, gstin: true, address: true, contactNumber: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } }, batch: { select: { id: true, batchNumber: true, expiryDate: true } } } },
  payments: true,
} as const;

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

salesRouter.get("/", requirePermission("sales", "view"), async (req, res, next) => {
  try {
    const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
    const sales = await prisma.sale.findMany({
      where: { tenantId: req.user!.tenantId, branchId: { in: req.user!.branchIds }, ...(customerId ? { customerId } : {}) },
      include: saleInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ data: sales });
  } catch (err) {
    next(err);
  }
});

salesRouter.get("/:id", requirePermission("sales", "view"), async (req, res, next) => {
  try {
    const sale = await prisma.sale.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId }, include: saleInclude });
    if (!sale) throw new NotFoundError("Sale not found");
    assertBranchAccessible(req, sale.branchId);
    res.json({ data: sale });
  } catch (err) {
    next(err);
  }
});

// The core POS endpoint: prices the basket, allocates stock across FEFO batches (may span
// several batches per line), enforces discount limits and customer credit limits, then books
// the invoice and reduces stock atomically.
salesRouter.post("/", requirePermission("pos", "add"), validateBody(createSaleSchema), async (req, res, next) => {
  try {
    const body = req.body as CreateSaleInput;
    assertBranchAccessible(req, body.branchId);

    for (const item of body.items) {
      if (item.discountPercent > req.user!.discountLimitPercent) {
        throw new ForbiddenError(
          `Discount of ${item.discountPercent}% exceeds your permitted limit of ${req.user!.discountLimitPercent}%`
        );
      }
    }

    const productIds = [...new Set(body.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, tenantId: req.user!.tenantId } });
    if (products.length !== productIds.length) throw new ValidationError("One or more productIds are invalid for this tenant");
    const productById = new Map(products.map((p) => [p.id, p]));

    let customer = null;
    if (body.customerId) {
      customer = await prisma.customer.findFirst({ where: { id: body.customerId, tenantId: req.user!.tenantId } });
      if (!customer) throw new ValidationError("Invalid customerId for this tenant");
    }

    const paidNow = body.payments.reduce((sum, p) => sum + p.amount, 0);

    const sale = await prisma.$transaction(async (tx) => {
      const lineResults: { productId: string; batchId: string; quantity: number; sellingPrice: number; discountPercent: number; gstRatePercent: number; mrp: number; lineTotal: number }[] = [];

      for (const item of body.items) {
        const product = productById.get(item.productId)!;
        const sellingPrice = item.sellingPrice ?? Number(product.sellingPrice);
        const allocations = await allocateFefoQuantity(tx, {
          tenantId: req.user!.tenantId,
          branchId: body.branchId,
          productId: item.productId,
          quantity: item.quantity,
        });

        for (const alloc of allocations) {
          const totals = computeSaleLineTotals({
            quantity: alloc.quantity,
            sellingPrice,
            discountPercent: item.discountPercent,
            gstRatePercent: alloc.gstRatePercent,
          });
          lineResults.push({
            productId: item.productId,
            batchId: alloc.batchId,
            quantity: alloc.quantity,
            sellingPrice,
            discountPercent: item.discountPercent,
            gstRatePercent: alloc.gstRatePercent,
            mrp: alloc.mrp,
            lineTotal: totals.lineTotal,
          });

          await adjustStock(tx, {
            tenantId: req.user!.tenantId,
            branchId: body.branchId,
            batchId: alloc.batchId,
            productId: item.productId,
            quantityDelta: -alloc.quantity,
            type: "SALE",
            createdById: req.user!.id,
          });
        }
      }

      const subtotal = lineResults.reduce((sum, l) => sum + (l.quantity * l.sellingPrice * (100 - l.discountPercent)) / 100, 0);
      const discountAmount = lineResults.reduce((sum, l) => sum + (l.quantity * l.sellingPrice * l.discountPercent) / 100, 0);
      const taxAmount = lineResults.reduce((sum, l) => sum + (l.lineTotal - (l.quantity * l.sellingPrice * (100 - l.discountPercent)) / 100), 0);
      const totalAmount = round2(lineResults.reduce((sum, l) => sum + l.lineTotal, 0));

      if (body.invoiceType === "CREDIT" && customer) {
        const outstanding = await getCustomerOutstanding(tx, customer.id);
        const projected = outstanding + totalAmount - paidNow;
        if (projected > Number(customer.creditLimit)) {
          throw new ValidationError(
            `This sale would push ${customer.name}'s outstanding balance to ${projected.toFixed(2)}, exceeding their credit limit of ${customer.creditLimit}`
          );
        }
      } else if (paidNow < totalAmount - 0.01 && body.invoiceType !== "CREDIT") {
        throw new ValidationError(`Payment total ${paidNow} does not cover invoice total ${totalAmount.toFixed(2)} for a non-credit sale`);
      }

      const branch = await tx.branch.findUniqueOrThrow({ where: { id: body.branchId } });
      const invoiceNumber = await getNextDocumentNumber(tx, {
        tenantId: req.user!.tenantId,
        branchId: body.branchId,
        docType: "SALE",
        prefix: branch.invoicePrefix || "INV",
      });

      const paymentStatus = paidNow <= 0 ? "UNPAID" : paidNow >= totalAmount - 0.01 ? "PAID" : "PARTIAL";

      const created = await tx.sale.create({
        data: {
          tenantId: req.user!.tenantId,
          branchId: body.branchId,
          counterId: body.counterId,
          customerId: body.customerId,
          doctorId: body.doctorId,
          prescriptionId: body.prescriptionId,
          invoiceNumber,
          invoiceType: body.invoiceType,
          subtotal: round2(subtotal),
          discountAmount: round2(discountAmount),
          taxAmount: round2(taxAmount),
          totalAmount,
          paidAmount: paidNow,
          paymentStatus,
          createdById: req.user!.id,
          items: {
            create: lineResults.map((l) => ({
              productId: l.productId,
              batchId: l.batchId,
              quantity: l.quantity,
              mrp: l.mrp,
              sellingPrice: l.sellingPrice,
              discountPercent: l.discountPercent,
              gstRatePercent: l.gstRatePercent,
              lineTotal: l.lineTotal,
            })),
          },
          payments: { create: body.payments.map((p) => ({ tenantId: req.user!.tenantId, ...p })) },
        },
      });

      return created;
    });

    const full = await prisma.sale.findFirst({ where: { id: sale.id }, include: saleInclude });
    recordAudit({ req, module: "sales", action: "create", entityType: "Sale", entityId: sale.id, newValue: { invoiceNumber: sale.invoiceNumber, totalAmount: sale.totalAmount }, branchId: sale.branchId });
    res.status(201).json({ data: full });
  } catch (err) {
    next(err);
  }
});

salesRouter.put("/:id/cancel", requirePermission("sales", "cancel"), validateBody(cancelSaleSchema), async (req, res, next) => {
  try {
    const sale = await prisma.sale.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId }, include: { items: true } });
    if (!sale) throw new NotFoundError("Sale not found");
    assertBranchAccessible(req, sale.branchId);
    if (sale.status === "CANCELLED") throw new ValidationError("Sale is already cancelled");

    await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        await adjustStock(tx, {
          tenantId: req.user!.tenantId,
          branchId: sale.branchId,
          batchId: item.batchId,
          productId: item.productId,
          quantityDelta: item.quantity,
          type: "SALE_RETURN",
          referenceType: "SaleCancellation",
          referenceId: sale.id,
          createdById: req.user!.id,
        });
      }
      // Cancelled sales are kept (never deleted) with their reason, per spec 55.10.
      await tx.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED", cancelReason: req.body.cancelReason } });
    });

    const full = await prisma.sale.findFirst({ where: { id: sale.id }, include: saleInclude });
    recordAudit({ req, module: "sales", action: "cancel", entityType: "Sale", entityId: sale.id, newValue: { cancelReason: req.body.cancelReason }, branchId: sale.branchId });
    res.json({ data: full });
  } catch (err) {
    next(err);
  }
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
