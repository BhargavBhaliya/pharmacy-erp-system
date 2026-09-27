import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { NotFoundError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { createDoctorSchema, updateDoctorSchema } from "./doctors.validation";

export const doctorsRouter = Router();
doctorsRouter.use(authenticate);

doctorsRouter.get("/", requirePermission("doctors", "view"), async (req, res, next) => {
  try {
    const doctors = await prisma.doctor.findMany({ where: { tenantId: req.user!.tenantId }, orderBy: { name: "asc" } });
    res.json({ data: doctors });
  } catch (err) {
    next(err);
  }
});

doctorsRouter.post("/", requirePermission("doctors", "add"), validateBody(createDoctorSchema), async (req, res, next) => {
  try {
    const doctor = await prisma.doctor.create({ data: { ...req.body, tenantId: req.user!.tenantId } });
    recordAudit({ req, module: "doctors", action: "create", entityType: "Doctor", entityId: doctor.id, newValue: doctor });
    res.status(201).json({ data: doctor });
  } catch (err) {
    next(err);
  }
});

doctorsRouter.put("/:id", requirePermission("doctors", "edit"), validateBody(updateDoctorSchema), async (req, res, next) => {
  try {
    const existing = await prisma.doctor.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Doctor not found");

    const doctor = await prisma.doctor.update({ where: { id: existing.id }, data: req.body });
    recordAudit({ req, module: "doctors", action: "update", entityType: "Doctor", entityId: doctor.id, oldValue: existing, newValue: doctor });
    res.json({ data: doctor });
  } catch (err) {
    next(err);
  }
});

doctorsRouter.delete("/:id", requirePermission("doctors", "delete"), async (req, res, next) => {
  try {
    const existing = await prisma.doctor.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Doctor not found");

    const doctor = await prisma.doctor.update({ where: { id: existing.id }, data: { isActive: false } });
    recordAudit({ req, module: "doctors", action: "deactivate", entityType: "Doctor", entityId: doctor.id, oldValue: existing });
    res.json({ data: doctor });
  } catch (err) {
    next(err);
  }
});
