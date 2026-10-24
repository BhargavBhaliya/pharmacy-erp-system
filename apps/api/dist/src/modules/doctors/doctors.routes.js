"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.doctorsRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const errors_1 = require("../../lib/errors");
const audit_1 = require("../../lib/audit");
const doctors_validation_1 = require("./doctors.validation");
exports.doctorsRouter = (0, express_1.Router)();
exports.doctorsRouter.use(auth_1.authenticate);
exports.doctorsRouter.get("/", (0, auth_1.requirePermission)("doctors", "view"), async (req, res, next) => {
    try {
        const doctors = await prisma_1.prisma.doctor.findMany({ where: { tenantId: req.user.tenantId }, orderBy: { name: "asc" } });
        res.json({ data: doctors });
    }
    catch (err) {
        next(err);
    }
});
exports.doctorsRouter.post("/", (0, auth_1.requirePermission)("doctors", "add"), (0, validate_1.validateBody)(doctors_validation_1.createDoctorSchema), async (req, res, next) => {
    try {
        const doctor = await prisma_1.prisma.doctor.create({ data: { ...req.body, tenantId: req.user.tenantId } });
        (0, audit_1.recordAudit)({ req, module: "doctors", action: "create", entityType: "Doctor", entityId: doctor.id, newValue: doctor });
        res.status(201).json({ data: doctor });
    }
    catch (err) {
        next(err);
    }
});
exports.doctorsRouter.put("/:id", (0, auth_1.requirePermission)("doctors", "edit"), (0, validate_1.validateBody)(doctors_validation_1.updateDoctorSchema), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.doctor.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Doctor not found");
        const doctor = await prisma_1.prisma.doctor.update({ where: { id: existing.id }, data: req.body });
        (0, audit_1.recordAudit)({ req, module: "doctors", action: "update", entityType: "Doctor", entityId: doctor.id, oldValue: existing, newValue: doctor });
        res.json({ data: doctor });
    }
    catch (err) {
        next(err);
    }
});
exports.doctorsRouter.delete("/:id", (0, auth_1.requirePermission)("doctors", "delete"), async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.doctor.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
        if (!existing)
            throw new errors_1.NotFoundError("Doctor not found");
        const doctor = await prisma_1.prisma.doctor.update({ where: { id: existing.id }, data: { isActive: false } });
        (0, audit_1.recordAudit)({ req, module: "doctors", action: "deactivate", entityType: "Doctor", entityId: doctor.id, oldValue: existing });
        res.json({ data: doctor });
    }
    catch (err) {
        next(err);
    }
});
