import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { notify } from "../../lib/notify";
import { closeCashSessionSchema, openCashSessionSchema } from "./cash-sessions.validation";

const CASH_MISMATCH_THRESHOLD = 50;

export const cashSessionsRouter = Router();
cashSessionsRouter.use(authenticate);

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

const sessionInclude = { counter: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } } as const;

cashSessionsRouter.get("/", requirePermission("pos", "view"), async (req, res, next) => {
  try {
    const sessions = await prisma.cashSession.findMany({
      where: { tenantId: req.user!.tenantId, branchId: { in: req.user!.branchIds } },
      include: sessionInclude,
      orderBy: { openedAt: "desc" },
    });
    res.json({ data: sessions });
  } catch (err) {
    next(err);
  }
});

cashSessionsRouter.post("/", requirePermission("pos", "add"), validateBody(openCashSessionSchema), async (req, res, next) => {
  try {
    assertBranchAccessible(req, req.body.branchId);

    const openAlready = await prisma.cashSession.findFirst({ where: { counterId: req.body.counterId, status: "OPEN" } });
    if (openAlready) throw new ValidationError("This counter already has an open cash session");

    const session = await prisma.cashSession.create({
      data: { ...req.body, tenantId: req.user!.tenantId, openedById: req.user!.id },
      include: sessionInclude,
    });

    recordAudit({ req, module: "pos", action: "open_cash_session", entityType: "CashSession", entityId: session.id, newValue: { openingAmount: session.openingAmount }, branchId: session.branchId });
    res.status(201).json({ data: session });
  } catch (err) {
    next(err);
  }
});

// Expected closing = opening + cash sales collected - cash paid to suppliers - approved cash
// expenses, all within [openedAt, now], for this session's branch. See README for why this is
// derived from source documents rather than a parallel double-entry ledger.
cashSessionsRouter.put("/:id/close", requirePermission("pos", "add"), validateBody(closeCashSessionSchema), async (req, res, next) => {
  try {
    const session = await prisma.cashSession.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!session) throw new NotFoundError("Cash session not found");
    assertBranchAccessible(req, session.branchId);
    if (session.status !== "OPEN") throw new ValidationError("This cash session is already closed");

    const closedAt = new Date();
    const window = { gte: session.openedAt, lte: closedAt };

    const [cashIn, cashOutSuppliers, cashOutExpenses] = await Promise.all([
      prisma.salePayment.aggregate({
        _sum: { amount: true },
        where: { paymentMode: "CASH", paymentDate: window, sale: { branchId: session.branchId, tenantId: req.user!.tenantId } },
      }),
      prisma.purchasePayment.aggregate({
        _sum: { amount: true },
        where: { paymentMode: "CASH", paymentDate: window, purchase: { branchId: session.branchId, tenantId: req.user!.tenantId } },
      }),
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: { paymentMode: "CASH", status: "APPROVED", expenseDate: window, branchId: session.branchId, tenantId: req.user!.tenantId },
      }),
    ]);

    const expectedClosingAmount =
      Number(session.openingAmount) + Number(cashIn._sum.amount ?? 0) - Number(cashOutSuppliers._sum.amount ?? 0) - Number(cashOutExpenses._sum.amount ?? 0);
    const variance = Math.round((req.body.closingAmount - expectedClosingAmount) * 100) / 100;

    const updated = await prisma.cashSession.update({
      where: { id: session.id },
      data: {
        status: "CLOSED",
        closedById: req.user!.id,
        closedAt,
        closingAmount: req.body.closingAmount,
        expectedClosingAmount,
        variance,
        notes: req.body.notes,
      },
      include: sessionInclude,
    });

    recordAudit({ req, module: "pos", action: "close_cash_session", entityType: "CashSession", entityId: session.id, newValue: { closingAmount: req.body.closingAmount, expectedClosingAmount, variance }, branchId: session.branchId });
    if (Math.abs(variance) >= CASH_MISMATCH_THRESHOLD) {
      notify({
        tenantId: req.user!.tenantId,
        type: "cash_mismatch",
        title: "Cash drawer mismatch",
        message: `${updated.counter.name} closed with a variance of ₹${variance} (expected ₹${expectedClosingAmount.toFixed(2)}, counted ₹${req.body.closingAmount})`,
        link: "/cash-sessions",
      });
    }
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});
