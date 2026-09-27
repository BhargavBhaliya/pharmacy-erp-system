import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { createPrescriptionSchema } from "./prescriptions.validation";

export const prescriptionsRouter = Router();
prescriptionsRouter.use(authenticate);

const prescriptionInclude = {
  customer: { select: { id: true, name: true, mobile: true } },
  doctor: { select: { id: true, name: true } },
  items: true,
} as const;

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

prescriptionsRouter.get("/", requirePermission("prescriptions", "view"), async (req, res, next) => {
  try {
    const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
    const prescriptions = await prisma.prescription.findMany({
      where: { tenantId: req.user!.tenantId, branchId: { in: req.user!.branchIds }, ...(customerId ? { customerId } : {}) },
      include: prescriptionInclude,
      orderBy: { prescriptionDate: "desc" },
    });
    res.json({ data: prescriptions });
  } catch (err) {
    next(err);
  }
});

prescriptionsRouter.get("/:id", requirePermission("prescriptions", "view"), async (req, res, next) => {
  try {
    const prescription = await prisma.prescription.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId }, include: prescriptionInclude });
    if (!prescription) throw new NotFoundError("Prescription not found");
    assertBranchAccessible(req, prescription.branchId);
    res.json({ data: prescription });
  } catch (err) {
    next(err);
  }
});

prescriptionsRouter.post("/", requirePermission("prescriptions", "add"), validateBody(createPrescriptionSchema), async (req, res, next) => {
  try {
    assertBranchAccessible(req, req.body.branchId);

    const customer = await prisma.customer.findFirst({ where: { id: req.body.customerId, tenantId: req.user!.tenantId } });
    if (!customer) throw new NotFoundError("Customer not found");

    const { items, ...rest } = req.body as typeof req.body;
    const prescription = await prisma.prescription.create({
      data: { ...rest, tenantId: req.user!.tenantId, createdById: req.user!.id, items: { create: items } },
      include: prescriptionInclude,
    });

    recordAudit({ req, module: "prescriptions", action: "create", entityType: "Prescription", entityId: prescription.id, branchId: prescription.branchId });
    res.status(201).json({ data: prescription });
  } catch (err) {
    next(err);
  }
});
