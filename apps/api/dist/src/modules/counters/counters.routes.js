"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countersRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
exports.countersRouter = (0, express_1.Router)();
exports.countersRouter.use(auth_1.authenticate);
const createCounterSchema = zod_1.z.object({ branchId: zod_1.z.string().min(1), name: zod_1.z.string().min(1).max(100) });
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
exports.countersRouter.get("/", (0, auth_1.requirePermission)("branches", "view"), async (req, res, next) => {
    try {
        const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
        if (branchId)
            assertBranchAccessible(req, branchId);
        const counters = await prisma_1.prisma.counter.findMany({
            where: { tenantId: req.user.tenantId, branchId: branchId ?? { in: req.user.branchIds } },
            orderBy: { name: "asc" },
        });
        res.json({ data: counters });
    }
    catch (err) {
        next(err);
    }
});
exports.countersRouter.post("/", (0, auth_1.requirePermission)("branches", "add"), (0, validate_1.validateBody)(createCounterSchema), async (req, res, next) => {
    try {
        assertBranchAccessible(req, req.body.branchId);
        const existing = await prisma_1.prisma.counter.findFirst({ where: { branchId: req.body.branchId, name: req.body.name } });
        if (existing)
            throw new errors_1.ValidationError("A counter with this name already exists in this branch");
        const counter = await prisma_1.prisma.counter.create({ data: { ...req.body, tenantId: req.user.tenantId } });
        (0, audit_1.recordAudit)({ req, module: "branches", action: "create_counter", entityType: "Counter", entityId: counter.id, branchId: counter.branchId });
        res.status(201).json({ data: counter });
    }
    catch (err) {
        next(err);
    }
});
