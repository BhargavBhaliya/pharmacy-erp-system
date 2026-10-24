"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prescriptionsRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const prescriptions_validation_1 = require("./prescriptions.validation");
exports.prescriptionsRouter = (0, express_1.Router)();
exports.prescriptionsRouter.use(auth_1.authenticate);
const prescriptionInclude = {
    customer: { select: { id: true, name: true, mobile: true } },
    doctor: { select: { id: true, name: true } },
    items: true,
};
function assertBranchAccessible(req, branchId) {
    if (!req.user.branchIds.includes(branchId))
        throw new errors_1.ForbiddenError("You do not have access to this branch");
}
exports.prescriptionsRouter.get("/", (0, auth_1.requirePermission)("prescriptions", "view"), async (req, res, next) => {
    try {
        const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
        const prescriptions = await prisma_1.prisma.prescription.findMany({
            where: { tenantId: req.user.tenantId, branchId: { in: req.user.branchIds }, ...(customerId ? { customerId } : {}) },
            include: prescriptionInclude,
            orderBy: { prescriptionDate: "desc" },
            take: 200,
        });
        res.json({ data: prescriptions });
    }
    catch (err) {
        next(err);
    }
});
exports.prescriptionsRouter.get("/:id", (0, auth_1.requirePermission)("prescriptions", "view"), async (req, res, next) => {
    try {
        const prescription = await prisma_1.prisma.prescription.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: prescriptionInclude });
        if (!prescription)
            throw new errors_1.NotFoundError("Prescription not found");
        assertBranchAccessible(req, prescription.branchId);
        res.json({ data: prescription });
    }
    catch (err) {
        next(err);
    }
});
exports.prescriptionsRouter.post("/", (0, auth_1.requirePermission)("prescriptions", "add"), (0, validate_1.validateBody)(prescriptions_validation_1.createPrescriptionSchema), async (req, res, next) => {
    try {
        assertBranchAccessible(req, req.body.branchId);
        const customer = await prisma_1.prisma.customer.findFirst({ where: { id: req.body.customerId, tenantId: req.user.tenantId } });
        if (!customer)
            throw new errors_1.NotFoundError("Customer not found");
        const { items, ...rest } = req.body;
        const prescription = await prisma_1.prisma.prescription.create({
            data: { ...rest, tenantId: req.user.tenantId, createdById: req.user.id, items: { create: items } },
            include: prescriptionInclude,
        });
        (0, audit_1.recordAudit)({ req, module: "prescriptions", action: "create", entityType: "Prescription", entityId: prescription.id, branchId: prescription.branchId });
        res.status(201).json({ data: prescription });
    }
    catch (err) {
        next(err);
    }
});
exports.prescriptionsRouter.put("/:id", (0, auth_1.requirePermission)("prescriptions", "edit"), (0, validate_1.validateBody)(prescriptions_validation_1.updatePrescriptionSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.prescription.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: prescriptionInclude });
        if (!existing)
            throw new errors_1.NotFoundError("Prescription not found");
        assertBranchAccessible(req, existing.branchId);
        if (req.body.branchId)
            assertBranchAccessible(req, req.body.branchId);
        if (req.body.customerId) {
            const customer = await prisma_1.prisma.customer.findFirst({ where: { id: req.body.customerId, tenantId: req.user.tenantId } });
            if (!customer)
                throw new errors_1.NotFoundError("Customer not found");
        }
        const { items, ...rest } = req.body;
        const prescription = await prisma_1.prisma.$transaction(async (tx) => {
            if (items) {
                await tx.prescriptionItem.deleteMany({ where: { prescriptionId: existing.id } });
            }
            return tx.prescription.update({
                where: { id: existing.id },
                data: { ...rest, ...(items ? { items: { create: items } } : {}) },
                include: prescriptionInclude,
            });
        });
        (0, audit_1.recordAudit)({
            req,
            module: "prescriptions",
            action: "update",
            entityType: "Prescription",
            entityId: prescription.id,
            branchId: prescription.branchId,
            oldValue: existing,
            newValue: prescription,
        });
        res.json({ data: prescription });
    }
    catch (err) {
        next(err);
    }
});
