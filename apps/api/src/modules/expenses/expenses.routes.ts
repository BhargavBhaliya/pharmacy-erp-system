import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { notify } from "../../lib/notify";
import { createExpenseCategorySchema, createExpenseSchema } from "./expenses.validation";

export const expenseCategoriesRouter = Router();
expenseCategoriesRouter.use(authenticate);

expenseCategoriesRouter.get("/", requirePermission("expenses", "view"), async (req, res, next) => {
  try {
    const categories = await prisma.expenseCategory.findMany({ where: { tenantId: req.user!.tenantId }, orderBy: { name: "asc" } });
    res.json({ data: categories });
  } catch (err) {
    next(err);
  }
});

expenseCategoriesRouter.post("/", requirePermission("expenses", "add"), validateBody(createExpenseCategorySchema), async (req, res, next) => {
  try {
    const category = await prisma.expenseCategory.create({ data: { ...req.body, tenantId: req.user!.tenantId } });
    res.status(201).json({ data: category });
  } catch (err) {
    next(err);
  }
});

export const expensesRouter = Router();
expensesRouter.use(authenticate);

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

const expenseInclude = {
  category: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
} as const;

expensesRouter.get("/", requirePermission("expenses", "view"), async (req, res, next) => {
  try {
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    const expenses = await prisma.expense.findMany({
      where: {
        tenantId: req.user!.tenantId,
        branchId: { in: req.user!.branchIds },
        ...(from || to ? { expenseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: expenseInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ data: expenses });
  } catch (err) {
    next(err);
  }
});

// Same auto-approve-if-permitted pattern as sales returns: someone who can already approve
// expenses gets it recorded as APPROVED immediately; everyone else's expense waits for review.
expensesRouter.post("/", requirePermission("expenses", "add"), validateBody(createExpenseSchema), async (req, res, next) => {
  try {
    assertBranchAccessible(req, req.body.branchId);

    const category = await prisma.expenseCategory.findFirst({ where: { id: req.body.categoryId, tenantId: req.user!.tenantId } });
    if (!category) throw new ValidationError("Invalid categoryId for this tenant");

    const canAutoApprove = req.user!.permissionCodes.has("expenses.approve");
    const expense = await prisma.expense.create({
      data: {
        ...req.body,
        tenantId: req.user!.tenantId,
        createdById: req.user!.id,
        status: canAutoApprove ? "APPROVED" : "PENDING",
        approvedById: canAutoApprove ? req.user!.id : undefined,
      },
      include: expenseInclude,
    });

    recordAudit({ req, module: "expenses", action: "create", entityType: "Expense", entityId: expense.id, newValue: { amount: expense.amount, status: expense.status }, branchId: expense.branchId });
    if (!canAutoApprove) {
      notify({ tenantId: req.user!.tenantId, type: "expense_pending", title: "Expense awaiting approval", message: `₹${expense.amount} (${category.name}) needs approval`, link: "/expenses" });
    }
    res.status(201).json({ data: expense });
  } catch (err) {
    next(err);
  }
});

expensesRouter.put("/:id/approve", requirePermission("expenses", "approve"), async (req, res, next) => {
  try {
    const expense = await prisma.expense.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!expense) throw new NotFoundError("Expense not found");
    assertBranchAccessible(req, expense.branchId);
    if (expense.status !== "PENDING") throw new ValidationError(`Cannot approve an expense in status ${expense.status}`);

    const updated = await prisma.expense.update({ where: { id: expense.id }, data: { status: "APPROVED", approvedById: req.user!.id }, include: expenseInclude });
    recordAudit({ req, module: "expenses", action: "approve", entityType: "Expense", entityId: expense.id, branchId: expense.branchId });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

expensesRouter.put("/:id/reject", requirePermission("expenses", "approve"), async (req, res, next) => {
  try {
    const expense = await prisma.expense.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!expense) throw new NotFoundError("Expense not found");
    assertBranchAccessible(req, expense.branchId);
    if (expense.status !== "PENDING") throw new ValidationError(`Cannot reject an expense in status ${expense.status}`);

    const updated = await prisma.expense.update({ where: { id: expense.id }, data: { status: "REJECTED", approvedById: req.user!.id }, include: expenseInclude });
    recordAudit({ req, module: "expenses", action: "reject", entityType: "Expense", entityId: expense.id, branchId: expense.branchId });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});
