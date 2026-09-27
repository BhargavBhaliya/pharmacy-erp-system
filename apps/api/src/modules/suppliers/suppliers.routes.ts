import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { createSupplierSchema, updateSupplierSchema } from "./suppliers.validation";

export const suppliersRouter = Router();
suppliersRouter.use(authenticate);

suppliersRouter.get("/", requirePermission("suppliers", "view"), async (req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { name: "asc" },
    });
    res.json({ data: suppliers });
  } catch (err) {
    next(err);
  }
});

suppliersRouter.get("/:id", requirePermission("suppliers", "view"), async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!supplier) throw new NotFoundError("Supplier not found");
    res.json({ data: supplier });
  } catch (err) {
    next(err);
  }
});

suppliersRouter.post("/", requirePermission("suppliers", "add"), validateBody(createSupplierSchema), async (req, res, next) => {
  try {
    const existing = await prisma.supplier.findFirst({ where: { tenantId: req.user!.tenantId, name: req.body.name } });
    if (existing) throw new ConflictError("A supplier with this name already exists");

    const supplier = await prisma.supplier.create({ data: { ...req.body, tenantId: req.user!.tenantId } });
    recordAudit({ req, module: "suppliers", action: "create", entityType: "Supplier", entityId: supplier.id, newValue: supplier });
    res.status(201).json({ data: supplier });
  } catch (err) {
    next(err);
  }
});

suppliersRouter.put("/:id", requirePermission("suppliers", "edit"), validateBody(updateSupplierSchema), async (req, res, next) => {
  try {
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Supplier not found");

    const supplier = await prisma.supplier.update({ where: { id: existing.id }, data: req.body });
    recordAudit({ req, module: "suppliers", action: "update", entityType: "Supplier", entityId: supplier.id, oldValue: existing, newValue: supplier });
    res.json({ data: supplier });
  } catch (err) {
    next(err);
  }
});

suppliersRouter.delete("/:id", requirePermission("suppliers", "delete"), async (req, res, next) => {
  try {
    const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Supplier not found");

    const supplier = await prisma.supplier.update({ where: { id: existing.id }, data: { isActive: false } });
    recordAudit({ req, module: "suppliers", action: "deactivate", entityType: "Supplier", entityId: supplier.id, oldValue: existing });
    res.json({ data: supplier });
  } catch (err) {
    next(err);
  }
});
