"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.branchesRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const branches_validation_1 = require("./branches.validation");
exports.branchesRouter = (0, express_1.Router)();
exports.branchesRouter.use(auth_1.authenticate);
exports.branchesRouter.get("/", (0, auth_1.requirePermission)("branches", "view"), async (req, res, next) => {
    try {
        // Tenant-wide roles see every branch; scoped roles see only their assigned ones.
        const branches = await prisma_1.prisma.branch.findMany({
            where: { tenantId: req.user.tenantId, id: { in: req.user.branchIds } },
            orderBy: { name: "asc" },
        });
        res.json({ data: branches });
    }
    catch (err) {
        next(err);
    }
});
exports.branchesRouter.get("/:id", (0, auth_1.requirePermission)("branches", "view"), async (req, res, next) => {
    try {
        const branch = await prisma_1.prisma.branch.findFirst({
            where: { id: req.params.id, tenantId: req.user.tenantId },
        });
        if (!branch)
            throw new errors_1.NotFoundError("Branch not found");
        res.json({ data: branch });
    }
    catch (err) {
        next(err);
    }
});
exports.branchesRouter.post("/", (0, auth_1.requirePermission)("branches", "add"), (0, validate_1.validateBody)(branches_validation_1.createBranchSchema), async (req, res, next) => {
    try {
        const branch = await prisma_1.prisma.branch.create({ data: { ...req.body, tenantId: req.user.tenantId } });
        (0, audit_1.recordAudit)({ req, module: "branches", action: "create", entityType: "Branch", entityId: branch.id, newValue: branch });
        res.status(201).json({ data: branch });
    }
    catch (err) {
        next(err);
    }
});
exports.branchesRouter.put("/:id", (0, auth_1.requirePermission)("branches", "edit"), (0, validate_1.validateBody)(branches_validation_1.updateBranchSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.branch.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Branch not found");
        const branch = await prisma_1.prisma.branch.update({ where: { id: existing.id }, data: req.body });
        (0, audit_1.recordAudit)({ req, module: "branches", action: "update", entityType: "Branch", entityId: branch.id, oldValue: existing, newValue: branch });
        res.json({ data: branch });
    }
    catch (err) {
        next(err);
    }
});
exports.branchesRouter.delete("/:id", (0, auth_1.requirePermission)("branches", "delete"), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.branch.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Branch not found");
        // Branches carry financial/stock history; deactivate rather than hard-delete (spec 55.11).
        const branch = await prisma_1.prisma.branch.update({ where: { id: existing.id }, data: { isActive: false } });
        (0, audit_1.recordAudit)({ req, module: "branches", action: "deactivate", entityType: "Branch", entityId: branch.id, oldValue: existing, newValue: branch });
        res.json({ data: branch });
    }
    catch (err) {
        next(err);
    }
});
