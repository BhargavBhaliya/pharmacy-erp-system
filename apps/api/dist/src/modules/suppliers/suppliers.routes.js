"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suppliersRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const suppliers_validation_1 = require("./suppliers.validation");
exports.suppliersRouter = (0, express_1.Router)();
exports.suppliersRouter.use(auth_1.authenticate);
exports.suppliersRouter.get("/", (0, auth_1.requirePermission)("suppliers", "view"), async (req, res, next) => {
    try {
        const suppliers = await prisma_1.prisma.supplier.findMany({
            where: { tenantId: req.user.tenantId },
            orderBy: { name: "asc" },
        });
        res.json({ data: suppliers });
    }
    catch (err) {
        next(err);
    }
});
exports.suppliersRouter.get("/:id", (0, auth_1.requirePermission)("suppliers", "view"), async (req, res, next) => {
    try {
        const supplier = await prisma_1.prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!supplier)
            throw new errors_1.NotFoundError("Supplier not found");
        res.json({ data: supplier });
    }
    catch (err) {
        next(err);
    }
});
exports.suppliersRouter.post("/", (0, auth_1.requirePermission)("suppliers", "add"), (0, validate_1.validateBody)(suppliers_validation_1.createSupplierSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.supplier.findFirst({ where: { tenantId: req.user.tenantId, name: req.body.name } });
        if (existing)
            throw new errors_1.ConflictError("A supplier with this name already exists");
        const supplier = await prisma_1.prisma.supplier.create({ data: { ...req.body, tenantId: req.user.tenantId } });
        (0, audit_1.recordAudit)({ req, module: "suppliers", action: "create", entityType: "Supplier", entityId: supplier.id, newValue: supplier });
        res.status(201).json({ data: supplier });
    }
    catch (err) {
        next(err);
    }
});
exports.suppliersRouter.put("/:id", (0, auth_1.requirePermission)("suppliers", "edit"), (0, validate_1.validateBody)(suppliers_validation_1.updateSupplierSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Supplier not found");
        const supplier = await prisma_1.prisma.supplier.update({ where: { id: existing.id }, data: req.body });
        (0, audit_1.recordAudit)({ req, module: "suppliers", action: "update", entityType: "Supplier", entityId: supplier.id, oldValue: existing, newValue: supplier });
        res.json({ data: supplier });
    }
    catch (err) {
        next(err);
    }
});
exports.suppliersRouter.delete("/:id", (0, auth_1.requirePermission)("suppliers", "delete"), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Supplier not found");
        const supplier = await prisma_1.prisma.supplier.update({ where: { id: existing.id }, data: { isActive: false } });
        (0, audit_1.recordAudit)({ req, module: "suppliers", action: "deactivate", entityType: "Supplier", entityId: supplier.id, oldValue: existing });
        res.json({ data: supplier });
    }
    catch (err) {
        next(err);
    }
});
