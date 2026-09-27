import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ConflictError, NotFoundError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";

// Manufacturers, categories, and units are all simple named lookup tables that back the
// Product master. They share the exact same CRUD shape, so one generic router factory
// avoids three near-identical copies of the same code.

const nameSchema = z.object({ name: z.string().min(1).max(200) });

interface SimpleDelegate {
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<{ id: string }>;
  update: (args: unknown) => Promise<unknown>;
  count: (args: unknown) => Promise<number>;
}

function buildSimpleCatalogRouter(
  getDelegate: () => SimpleDelegate,
  entityType: string,
  extraFields: z.ZodRawShape = {}
) {
  const router = Router();
  const createSchema = nameSchema.extend(extraFields);
  const updateSchema = createSchema.partial().extend({ isActive: z.boolean().optional() });

  router.use(authenticate);

  router.get("/", requirePermission("products", "view"), async (req, res, next) => {
    try {
      const rows = await getDelegate().findMany({
        where: { tenantId: req.user!.tenantId },
        orderBy: { name: "asc" },
      });
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", requirePermission("products", "add"), validateBody(createSchema), async (req, res, next) => {
    try {
      const existing = await getDelegate().findFirst({ where: { tenantId: req.user!.tenantId, name: req.body.name } });
      if (existing) throw new ConflictError(`A ${entityType} with this name already exists`);

      const row = await getDelegate().create({ data: { ...req.body, tenantId: req.user!.tenantId } });
      recordAudit({ req, module: "products", action: "create", entityType, entityId: row.id, newValue: req.body });
      res.status(201).json({ data: row });
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id", requirePermission("products", "edit"), validateBody(updateSchema), async (req, res, next) => {
    try {
      const existing = await getDelegate().findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
      if (!existing) throw new NotFoundError(`${entityType} not found`);

      const row = await getDelegate().update({ where: { id: req.params.id }, data: req.body });
      recordAudit({ req, module: "products", action: "update", entityType, entityId: req.params.id, oldValue: existing, newValue: row });
      res.json({ data: row });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", requirePermission("products", "delete"), async (req, res, next) => {
    try {
      const existing = await getDelegate().findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
      if (!existing) throw new NotFoundError(`${entityType} not found`);

      const row = await getDelegate().update({ where: { id: req.params.id }, data: { isActive: false } });
      recordAudit({ req, module: "products", action: "deactivate", entityType, entityId: req.params.id, oldValue: existing });
      res.json({ data: row });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const manufacturersRouter = buildSimpleCatalogRouter(
  () => prisma.manufacturer as unknown as SimpleDelegate,
  "Manufacturer",
  { contactPerson: z.string().optional(), phone: z.string().optional(), email: z.string().email().optional(), address: z.string().optional() }
);

export const productCategoriesRouter = buildSimpleCatalogRouter(
  () => prisma.productCategory as unknown as SimpleDelegate,
  "ProductCategory",
  { parentCategoryId: z.string().optional() }
);

export const unitsRouter = buildSimpleCatalogRouter(
  () => prisma.unit as unknown as SimpleDelegate,
  "Unit",
  { shortCode: z.string().optional() }
);
