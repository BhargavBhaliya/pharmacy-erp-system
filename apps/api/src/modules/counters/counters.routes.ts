import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ForbiddenError, ValidationError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";

export const countersRouter = Router();
countersRouter.use(authenticate);

const createCounterSchema = z.object({ branchId: z.string().min(1), name: z.string().min(1).max(100) });

function assertBranchAccessible(req: import("express").Request, branchId: string) {
  if (!req.user!.branchIds.includes(branchId)) throw new ForbiddenError("You do not have access to this branch");
}

countersRouter.get("/", requirePermission("branches", "view"), async (req, res, next) => {
  try {
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
    if (branchId) assertBranchAccessible(req, branchId);

    const counters = await prisma.counter.findMany({
      where: { tenantId: req.user!.tenantId, branchId: branchId ?? { in: req.user!.branchIds } },
      orderBy: { name: "asc" },
    });
    res.json({ data: counters });
  } catch (err) {
    next(err);
  }
});

countersRouter.post("/", requirePermission("branches", "add"), validateBody(createCounterSchema), async (req, res, next) => {
  try {
    assertBranchAccessible(req, req.body.branchId);

    const existing = await prisma.counter.findFirst({ where: { branchId: req.body.branchId, name: req.body.name } });
    if (existing) throw new ValidationError("A counter with this name already exists in this branch");

    const counter = await prisma.counter.create({ data: { ...req.body, tenantId: req.user!.tenantId } });
    recordAudit({ req, module: "branches", action: "create_counter", entityType: "Counter", entityId: counter.id, branchId: counter.branchId });
    res.status(201).json({ data: counter });
  } catch (err) {
    next(err);
  }
});
