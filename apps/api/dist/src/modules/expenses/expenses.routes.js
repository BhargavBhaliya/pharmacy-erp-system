"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expensesRouter = exports.expenseCategoriesRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const notify_1 = require("../../lib/notify");
const expenses_validation_1 = require("./expenses.validation");
exports.expenseCategoriesRouter = (0, express_1.Router)();
exports.expenseCategoriesRouter.use(auth_1.authenticate);
exports.expenseCategoriesRouter.get("/", (0, auth_1.requirePermission)("expenses", "view"), async (req, res, next) => {
    try {
        const categories = await prisma_1.prisma.expenseCategory.findMany({ where: { tenantId: req.user.tenantId }, orderBy: { name: "asc" } });
        res.json({ data: categories });
    }
    catch (err) {
        next(err);
    }
});
exports.expenseCategoriesRouter.post("/", (0, auth_1.requirePermission)("expenses", "add"), (0, validate_1.validateBody)(expenses_validation_1.createExpenseCategorySchema), async (req, res, next) => {
    try {
        const category = await prisma_1.prisma.expenseCategory.create({ data: { ...req.body, tenantId: req.user.tenantId } });
        res.status(201).json({ data: category });
    }
    catch (err) {
        next(err);
    }
});
exports.expensesRouter = (0, express_1.Router)();
exports.expensesRouter.use(auth_1.authenticate);
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
const expenseInclude = {
    category: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true } },
};
exports.expensesRouter.get("/", (0, auth_1.requirePermission)("expenses", "view"), async (req, res, next) => {
    try {
        const expenses = await prisma_1.prisma.expense.findMany({
            where: { tenantId: req.user.tenantId, branchId: { in: req.user.branchIds } },
            include: expenseInclude,
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        res.json({ data: expenses });
    }
    catch (err) {
        next(err);
    }
});
// Same auto-approve-if-permitted pattern as sales returns: someone who can already approve
// expenses gets it recorded as APPROVED immediately; everyone else's expense waits for review.
exports.expensesRouter.post("/", (0, auth_1.requirePermission)("expenses", "add"), (0, validate_1.validateBody)(expenses_validation_1.createExpenseSchema), async (req, res, next) => {
    try {
        assertBranchAccessible(req, req.body.branchId);
        const category = await prisma_1.prisma.expenseCategory.findFirst({ where: { id: req.body.categoryId, tenantId: req.user.tenantId } });
        if (!category)
            throw new errors_1.ValidationError("Invalid categoryId for this tenant");
        const canAutoApprove = req.user.permissionCodes.has("expenses.approve");
        const expense = await prisma_1.prisma.expense.create({
            data: {
                ...req.body,
                tenantId: req.user.tenantId,
                createdById: req.user.id,
                status: canAutoApprove ? "APPROVED" : "PENDING",
                approvedById: canAutoApprove ? req.user.id : undefined,
            },
            include: expenseInclude,
        });
        (0, audit_1.recordAudit)({ req, module: "expenses", action: "create", entityType: "Expense", entityId: expense.id, newValue: { amount: expense.amount, status: expense.status }, branchId: expense.branchId });
        if (!canAutoApprove) {
            (0, notify_1.notify)({ tenantId: req.user.tenantId, type: "expense_pending", title: "Expense awaiting approval", message: `₹${expense.amount} (${category.name}) needs approval`, link: "/expenses" });
        }
        res.status(201).json({ data: expense });
    }
    catch (err) {
        next(err);
    }
});
exports.expensesRouter.put("/:id/approve", (0, auth_1.requirePermission)("expenses", "approve"), async (req, res, next) => {
    try {
        const expense = await prisma_1.prisma.expense.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!expense)
            throw new errors_1.NotFoundError("Expense not found");
        assertBranchAccessible(req, expense.branchId);
        if (expense.status !== "PENDING")
            throw new errors_1.ValidationError(`Cannot approve an expense in status ${expense.status}`);
        const updated = await prisma_1.prisma.expense.update({ where: { id: expense.id }, data: { status: "APPROVED", approvedById: req.user.id }, include: expenseInclude });
        (0, audit_1.recordAudit)({ req, module: "expenses", action: "approve", entityType: "Expense", entityId: expense.id, branchId: expense.branchId });
        res.json({ data: updated });
    }
    catch (err) {
        next(err);
    }
});
exports.expensesRouter.put("/:id/reject", (0, auth_1.requirePermission)("expenses", "approve"), async (req, res, next) => {
    try {
        const expense = await prisma_1.prisma.expense.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!expense)
            throw new errors_1.NotFoundError("Expense not found");
        assertBranchAccessible(req, expense.branchId);
        if (expense.status !== "PENDING")
            throw new errors_1.ValidationError(`Cannot reject an expense in status ${expense.status}`);
        const updated = await prisma_1.prisma.expense.update({ where: { id: expense.id }, data: { status: "REJECTED", approvedById: req.user.id }, include: expenseInclude });
        (0, audit_1.recordAudit)({ req, module: "expenses", action: "reject", entityType: "Expense", entityId: expense.id, branchId: expense.branchId });
        res.json({ data: updated });
    }
    catch (err) {
        next(err);
    }
});
