"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customersRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const customerCredit_1 = require("../../lib/customerCredit");
const customers_validation_1 = require("./customers.validation");
exports.customersRouter = (0, express_1.Router)();
exports.customersRouter.use(auth_1.authenticate);
exports.customersRouter.get("/", (0, auth_1.requirePermission)("customers", "view"), async (req, res, next) => {
    try {
        const search = typeof req.query.search === "string" ? req.query.search : undefined;
        const customers = await prisma_1.prisma.customer.findMany({
            where: {
                tenantId: req.user.tenantId,
                ...(search
                    ? { OR: [{ name: { contains: search } }, { mobile: { contains: search } }] }
                    : {}),
            },
            orderBy: { name: "asc" },
            take: 500,
        });
        res.json({ data: customers });
    }
    catch (err) {
        next(err);
    }
});
exports.customersRouter.get("/:id", (0, auth_1.requirePermission)("customers", "view"), async (req, res, next) => {
    try {
        const customer = await prisma_1.prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!customer)
            throw new errors_1.NotFoundError("Customer not found");
        const outstanding = await (0, customerCredit_1.getCustomerOutstanding)(prisma_1.prisma, customer.id);
        res.json({ data: { ...customer, outstandingBalance: outstanding } });
    }
    catch (err) {
        next(err);
    }
});
exports.customersRouter.post("/", (0, auth_1.requirePermission)("customers", "add"), (0, validate_1.validateBody)(customers_validation_1.createCustomerSchema), async (req, res, next) => {
    try {
        const customer = await prisma_1.prisma.customer.create({ data: { ...req.body, tenantId: req.user.tenantId } });
        (0, audit_1.recordAudit)({ req, module: "customers", action: "create", entityType: "Customer", entityId: customer.id, newValue: customer });
        res.status(201).json({ data: customer });
    }
    catch (err) {
        next(err);
    }
});
exports.customersRouter.put("/:id", (0, auth_1.requirePermission)("customers", "edit"), (0, validate_1.validateBody)(customers_validation_1.updateCustomerSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Customer not found");
        const customer = await prisma_1.prisma.customer.update({ where: { id: existing.id }, data: req.body });
        (0, audit_1.recordAudit)({ req, module: "customers", action: "update", entityType: "Customer", entityId: customer.id, oldValue: existing, newValue: customer });
        res.json({ data: customer });
    }
    catch (err) {
        next(err);
    }
});
exports.customersRouter.delete("/:id", (0, auth_1.requirePermission)("customers", "delete"), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Customer not found");
        const customer = await prisma_1.prisma.customer.update({ where: { id: existing.id }, data: { isActive: false } });
        (0, audit_1.recordAudit)({ req, module: "customers", action: "deactivate", entityType: "Customer", entityId: customer.id, oldValue: existing });
        res.json({ data: customer });
    }
    catch (err) {
        next(err);
    }
});
