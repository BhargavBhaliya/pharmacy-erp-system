"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unitsRouter = exports.productCategoriesRouter = exports.manufacturersRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
// Manufacturers, categories, and units are all simple named lookup tables that back the
// Product master. They share the exact same CRUD shape, so one generic router factory
// avoids three near-identical copies of the same code.
const nameSchema = zod_1.z.object({ name: zod_1.z.string().min(1).max(200) });
function buildSimpleCatalogRouter(getDelegate, entityType, extraFields = {}) {
    const router = (0, express_1.Router)();
    const createSchema = nameSchema.extend(extraFields);
    const updateSchema = createSchema.partial().extend({ isActive: zod_1.z.boolean().optional() });
    router.use(auth_1.authenticate);
    router.get("/", (0, auth_1.requirePermission)("products", "view"), async (req, res, next) => {
        try {
            const rows = await getDelegate().findMany({
                where: { tenantId: req.user.tenantId },
                orderBy: { name: "asc" },
            });
            res.json({ data: rows });
        }
        catch (err) {
            next(err);
        }
    });
    router.post("/", (0, auth_1.requirePermission)("products", "add"), (0, validate_1.validateBody)(createSchema), async (req, res, next) => {
        try {
            const existing = await getDelegate().findFirst({ where: { tenantId: req.user.tenantId, name: req.body.name } });
            if (existing)
                throw new errors_1.ConflictError(`A ${entityType} with this name already exists`);
            const row = await getDelegate().create({ data: { ...req.body, tenantId: req.user.tenantId } });
            (0, audit_1.recordAudit)({ req, module: "products", action: "create", entityType, entityId: row.id, newValue: req.body });
            res.status(201).json({ data: row });
        }
        catch (err) {
            next(err);
        }
    });
    router.put("/:id", (0, auth_1.requirePermission)("products", "edit"), (0, validate_1.validateBody)(updateSchema), async (req, res, next) => {
        try {
            const existing = await getDelegate().findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
            if (!existing)
                throw new errors_1.NotFoundError(`${entityType} not found`);
            const row = await getDelegate().update({ where: { id: req.params.id }, data: req.body });
            (0, audit_1.recordAudit)({ req, module: "products", action: "update", entityType, entityId: req.params.id, oldValue: existing, newValue: row });
            res.json({ data: row });
        }
        catch (err) {
            next(err);
        }
    });
    router.delete("/:id", (0, auth_1.requirePermission)("products", "delete"), async (req, res, next) => {
        try {
            const existing = await getDelegate().findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
            if (!existing)
                throw new errors_1.NotFoundError(`${entityType} not found`);
            const row = await getDelegate().update({ where: { id: req.params.id }, data: { isActive: false } });
            (0, audit_1.recordAudit)({ req, module: "products", action: "deactivate", entityType, entityId: req.params.id, oldValue: existing });
            res.json({ data: row });
        }
        catch (err) {
            next(err);
        }
    });
    return router;
}
exports.manufacturersRouter = buildSimpleCatalogRouter(() => prisma_1.prisma.manufacturer, "Manufacturer", { contactPerson: zod_1.z.string().optional(), phone: zod_1.z.string().optional(), email: zod_1.z.string().email().optional(), address: zod_1.z.string().optional() });
exports.productCategoriesRouter = buildSimpleCatalogRouter(() => prisma_1.prisma.productCategory, "ProductCategory", { parentCategoryId: zod_1.z.string().optional() });
exports.unitsRouter = buildSimpleCatalogRouter(() => prisma_1.prisma.unit, "Unit", { shortCode: zod_1.z.string().optional() });
