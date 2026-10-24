"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cashSessionsRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const notify_1 = require("../../lib/notify");
const cash_sessions_validation_1 = require("./cash-sessions.validation");
const CASH_MISMATCH_THRESHOLD = 50;
exports.cashSessionsRouter = (0, express_1.Router)();
exports.cashSessionsRouter.use(auth_1.authenticate);
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
const sessionInclude = { counter: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } } };
exports.cashSessionsRouter.get("/", (0, auth_1.requirePermission)("pos", "view"), async (req, res, next) => {
    try {
        const sessions = await prisma_1.prisma.cashSession.findMany({
            where: { tenantId: req.user.tenantId, branchId: { in: req.user.branchIds } },
            include: sessionInclude,
            orderBy: { openedAt: "desc" },
            take: 200,
        });
        res.json({ data: sessions });
    }
    catch (err) {
        next(err);
    }
});
exports.cashSessionsRouter.post("/", (0, auth_1.requirePermission)("pos", "add"), (0, validate_1.validateBody)(cash_sessions_validation_1.openCashSessionSchema), async (req, res, next) => {
    try {
        assertBranchAccessible(req, req.body.branchId);
        const openAlready = await prisma_1.prisma.cashSession.findFirst({ where: { counterId: req.body.counterId, status: "OPEN" } });
        if (openAlready)
            throw new errors_1.ValidationError("This counter already has an open cash session");
        const session = await prisma_1.prisma.cashSession.create({
            data: { ...req.body, tenantId: req.user.tenantId, openedById: req.user.id },
            include: sessionInclude,
        });
        (0, audit_1.recordAudit)({ req, module: "pos", action: "open_cash_session", entityType: "CashSession", entityId: session.id, newValue: { openingAmount: session.openingAmount }, branchId: session.branchId });
        res.status(201).json({ data: session });
    }
    catch (err) {
        next(err);
    }
});
// Expected closing = opening + cash sales collected - cash paid to suppliers - approved cash
// expenses, all within [openedAt, now], for this session's branch. See README for why this is
// derived from source documents rather than a parallel double-entry ledger.
exports.cashSessionsRouter.put("/:id/close", (0, auth_1.requirePermission)("pos", "add"), (0, validate_1.validateBody)(cash_sessions_validation_1.closeCashSessionSchema), async (req, res, next) => {
    try {
        const session = await prisma_1.prisma.cashSession.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!session)
            throw new errors_1.NotFoundError("Cash session not found");
        assertBranchAccessible(req, session.branchId);
        if (session.status !== "OPEN")
            throw new errors_1.ValidationError("This cash session is already closed");
        const closedAt = new Date();
        const window = { gte: session.openedAt, lte: closedAt };
        const [cashIn, cashOutSuppliers, cashOutExpenses] = await Promise.all([
            prisma_1.prisma.salePayment.aggregate({
                _sum: { amount: true },
                where: { paymentMode: "CASH", paymentDate: window, sale: { branchId: session.branchId, tenantId: req.user.tenantId } },
            }),
            prisma_1.prisma.purchasePayment.aggregate({
                _sum: { amount: true },
                where: { paymentMode: "CASH", paymentDate: window, purchase: { branchId: session.branchId, tenantId: req.user.tenantId } },
            }),
            prisma_1.prisma.expense.aggregate({
                _sum: { amount: true },
                where: { paymentMode: "CASH", status: "APPROVED", expenseDate: window, branchId: session.branchId, tenantId: req.user.tenantId },
            }),
        ]);
        const expectedClosingAmount = Number(session.openingAmount) + Number(cashIn._sum.amount ?? 0) - Number(cashOutSuppliers._sum.amount ?? 0) - Number(cashOutExpenses._sum.amount ?? 0);
        const variance = Math.round((req.body.closingAmount - expectedClosingAmount) * 100) / 100;
        const updated = await prisma_1.prisma.cashSession.update({
            where: { id: session.id },
            data: {
                status: "CLOSED",
                closedById: req.user.id,
                closedAt,
                closingAmount: req.body.closingAmount,
                expectedClosingAmount,
                variance,
                notes: req.body.notes,
            },
            include: sessionInclude,
        });
        (0, audit_1.recordAudit)({ req, module: "pos", action: "close_cash_session", entityType: "CashSession", entityId: session.id, newValue: { closingAmount: req.body.closingAmount, expectedClosingAmount, variance }, branchId: session.branchId });
        if (Math.abs(variance) >= CASH_MISMATCH_THRESHOLD) {
            (0, notify_1.notify)({
                tenantId: req.user.tenantId,
                type: "cash_mismatch",
                title: "Cash drawer mismatch",
                message: `${updated.counter.name} closed with a variance of ₹${variance} (expected ₹${expectedClosingAmount.toFixed(2)}, counted ₹${req.body.closingAmount})`,
                link: "/cash-sessions",
            });
        }
        res.json({ data: updated });
    }
    catch (err) {
        next(err);
    }
});
