import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { NotFoundError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { createBranchSchema, updateBranchSchema } from "./branches.validation";

export const branchesRouter = Router();
branchesRouter.use(authenticate);

branchesRouter.get("/", requirePermission("branches", "view"), async (req, res, next) => {
  try {
    // Tenant-wide roles see every branch; scoped roles see only their assigned ones.
    const branches = await prisma.branch.findMany({
      where: { tenantId: req.user!.tenantId, id: { in: req.user!.branchIds } },
      orderBy: { name: "asc" },
    });
    res.json({ data: branches });
  } catch (err) {
    next(err);
  }
});

branchesRouter.get("/:id", requirePermission("branches", "view"), async (req, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!branch) throw new NotFoundError("Branch not found");
    res.json({ data: branch });
  } catch (err) {
    next(err);
  }
});

branchesRouter.post("/", requirePermission("branches", "add"), validateBody(createBranchSchema), async (req, res, next) => {
  try {
    const branch = await prisma.branch.create({ data: { ...req.body, tenantId: req.user!.tenantId } });
    recordAudit({ req, module: "branches", action: "create", entityType: "Branch", entityId: branch.id, newValue: branch });
    res.status(201).json({ data: branch });
  } catch (err) {
    next(err);
  }
});

branchesRouter.put("/:id", requirePermission("branches", "edit"), validateBody(updateBranchSchema), async (req, res, next) => {
  try {
    const existing = await prisma.branch.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Branch not found");

    const branch = await prisma.branch.update({ where: { id: existing.id }, data: req.body });
    recordAudit({ req, module: "branches", action: "update", entityType: "Branch", entityId: branch.id, oldValue: existing, newValue: branch });
    res.json({ data: branch });
  } catch (err) {
    next(err);
  }
});

branchesRouter.delete("/:id", requirePermission("branches", "delete"), async (req, res, next) => {
  try {
    const existing = await prisma.branch.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new NotFoundError("Branch not found");

    // Branches carry financial/stock history; deactivate rather than hard-delete (spec 55.11).
    const branch = await prisma.branch.update({ where: { id: existing.id }, data: { isActive: false } });
    recordAudit({ req, module: "branches", action: "deactivate", entityType: "Branch", entityId: branch.id, oldValue: existing, newValue: branch });
    res.json({ data: branch });
  } catch (err) {
    next(err);
  }
});
