import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { NotFoundError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { getCustomerOutstanding } from "../../lib/customerCredit";
import { createCustomerSchema, updateCustomerSchema } from "./customers.validation";

export const customersRouter = Router();
customersRouter.use(authenticate);

customersRouter.get("/", requirePermission("customers", "view"), async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const customers = await prisma.customer.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(search
          ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { mobile: { contains: search, mode: "insensitive" } }] }
          : {}),
      },
      orderBy: { name: "asc" },
    });
    res.json({ data: customers });
  } catch (err) {
    next(err);
  }
});

customersRouter.get("/:id", requirePermission("customers", "view"), async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!customer) throw new NotFoundError("Customer not found");
    const outstanding = await getCustomerOutstanding(prisma, customer.id);
    res.json({ data: { ...customer, outstandingBalance: outstanding } });
  } catch (err) {
    next(err);
  }
});

customersRouter.post("/", requirePermission("customers", "add"), validateBody(createCustomerSchema), async (req, res, next) => {
  try {
    const customer = await prisma.customer.create({ data: { ...req.body, tenantId: req.user!.tenantId } });
    recordAudit({ req, module: "customers", action: "create", entityType: "Customer", entityId: customer.id, newValue: customer });
    res.status(201).json({ data: customer });
  } catch (err) {
    next(err);
  }
});

customersRouter.put("/:id", requirePermission("customers", "edit"), validateBody(updateCustomerSchema), async (req, res, next) => {
  try {
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Customer not found");

    const customer = await prisma.customer.update({ where: { id: existing.id }, data: req.body });
    recordAudit({ req, module: "customers", action: "update", entityType: "Customer", entityId: customer.id, oldValue: existing, newValue: customer });
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

customersRouter.delete("/:id", requirePermission("customers", "delete"), async (req, res, next) => {
  try {
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Customer not found");

    const customer = await prisma.customer.update({ where: { id: existing.id }, data: { isActive: false } });
    recordAudit({ req, module: "customers", action: "deactivate", entityType: "Customer", entityId: customer.id, oldValue: existing });
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});
