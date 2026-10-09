import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authenticate, requirePermission } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { recordAudit } from "../../lib/audit";
import fs from "node:fs";
import { deleteUploadedFileIfOwned, imageUpload, publicUploadUrl, verifyImageMagicBytes } from "../../lib/upload";
import { ValidationError } from "../../lib/errors";
import { updateBusinessProfileSchema, updateSettingSchema } from "./settings.validation";

export const settingsRouter = Router();
settingsRouter.use(authenticate);

// Read-only branding info needed to render printable invoices/labels. Deliberately open to any
// authenticated user (no settings.view check) — a cashier printing a receipt shouldn't need
// settings access just to show the business name/GSTIN in the header.
settingsRouter.get("/branding", async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: req.user!.tenantId },
      select: {
        businessName: true,
        legalName: true,
        gstin: true,
        drugLicenseNumber: true,
        fssaiLicenseNumber: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        invoiceFooter: true,
        termsAndConditions: true,
        logoUrl: true,
        signatureUrl: true,
      },
    });
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

settingsRouter.get("/business", requirePermission("settings", "view"), async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put("/business", requirePermission("settings", "edit"), validateBody(updateBusinessProfileSchema), async (req, res, next) => {
  try {
    const before = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
    const tenant = await prisma.tenant.update({ where: { id: req.user!.tenantId }, data: req.body });
    recordAudit({ req, module: "settings", action: "update_business_profile", entityType: "Tenant", entityId: tenant.id, oldValue: before, newValue: tenant });
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
});

function handleBrandingImageUpload(field: "logoUrl" | "signatureUrl", auditAction: string) {
  return [
    requirePermission("settings", "edit"),
    imageUpload.single("file"),
    async (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
      try {
        if (!req.file) throw new ValidationError("No file uploaded");
        const tenantId = req.user!.tenantId;

        if (!verifyImageMagicBytes(req.file.path, req.file.mimetype)) {
          fs.unlink(req.file.path, () => undefined);
          throw new ValidationError("File content doesn't match a valid JPEG, PNG, or WebP image");
        }

        const before = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const url = publicUploadUrl(tenantId, req.file.filename);
        const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { [field]: url } });

        // Best-effort: remove the old file now that it's no longer referenced. Never blocks
        // the response on this — an orphaned file on disk is a non-issue, a failed response isn't.
        deleteUploadedFileIfOwned(tenantId, before[field]);

        recordAudit({ req, module: "settings", action: auditAction, entityType: "Tenant", entityId: tenantId });
        res.status(201).json({ data: { url } });
      } catch (err) {
        next(err);
      }
    },
  ] as const;
}

settingsRouter.post("/upload-logo", ...handleBrandingImageUpload("logoUrl", "upload_logo"));
settingsRouter.post("/upload-signature", ...handleBrandingImageUpload("signatureUrl", "upload_signature"));

// Generic tenant/branch-scoped key-value settings (e.g. "expiryWarningDays"), backing the
// Setting model from Phase 1. branchId in the body scopes it to one branch; omit for tenant-wide.
settingsRouter.get("/:key", requirePermission("settings", "view"), async (req, res, next) => {
  try {
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : null;
    const setting = await prisma.setting.findFirst({ where: { tenantId: req.user!.tenantId, branchId, key: req.params.key } });
    res.json({ data: setting?.value ?? null });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put("/:key", requirePermission("settings", "edit"), validateBody(updateSettingSchema), async (req, res, next) => {
  try {
    const branchId = req.body.branchId ?? null;
    // Prisma's compound-unique `where` shorthand rejects null components (SQL NULL isn't
    // equal to NULL), so a tenant-wide setting (branchId: null) needs a manual find + create/update.
    const existing = await prisma.setting.findFirst({ where: { tenantId: req.user!.tenantId, branchId, key: req.params.key } });
    const setting = existing
      ? await prisma.setting.update({ where: { id: existing.id }, data: { value: req.body.value } })
      : await prisma.setting.create({ data: { tenantId: req.user!.tenantId, branchId, key: req.params.key, value: req.body.value } });

    recordAudit({ req, module: "settings", action: "update_setting", entityType: "Setting", entityId: setting.id, newValue: { key: req.params.key, value: req.body.value } });
    res.json({ data: setting });
  } catch (err) {
    next(err);
  }
});

// Tenant-scoped data export ("backup"). A raw pg_dump would leak other tenants' rows since
// this is a shared database, so instead we export exactly this tenant's own data as JSON.
// See README "Known limitations" — there is no restore-from-export yet.
settingsRouter.get("/export/data", requirePermission("settings", "edit"), async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    const [
      tenant,
      branches,
      users,
      roles,
      manufacturers,
      productCategories,
      units,
      suppliers,
      products,
      batches,
      stockTransfers,
      purchaseOrders,
      purchases,
      doctors,
      customers,
      prescriptions,
      sales,
      expenseCategories,
      expenses,
      receipts,
      supplierPayments,
      cashSessions,
      settings,
    ] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.branch.findMany({ where: { tenantId }, include: { warehouses: true, counters: true } }),
      prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true, email: true, phone: true, roleId: true, isActive: true, createdAt: true } }),
      prisma.role.findMany({ where: { tenantId }, include: { rolePermissions: { include: { permission: true } } } }),
      prisma.manufacturer.findMany({ where: { tenantId } }),
      prisma.productCategory.findMany({ where: { tenantId } }),
      prisma.unit.findMany({ where: { tenantId } }),
      prisma.supplier.findMany({ where: { tenantId } }),
      prisma.product.findMany({ where: { tenantId }, include: { barcodes: true } }),
      prisma.batch.findMany({ where: { tenantId } }),
      prisma.stockTransfer.findMany({ where: { tenantId }, include: { items: true } }),
      prisma.purchaseOrder.findMany({ where: { tenantId }, include: { items: true } }),
      prisma.purchase.findMany({ where: { tenantId }, include: { items: true, payments: true, returns: { include: { items: true } } } }),
      prisma.doctor.findMany({ where: { tenantId } }),
      prisma.customer.findMany({ where: { tenantId } }),
      prisma.prescription.findMany({ where: { tenantId }, include: { items: true } }),
      prisma.sale.findMany({ where: { tenantId }, include: { items: true, payments: true, returns: { include: { items: true } } } }),
      prisma.expenseCategory.findMany({ where: { tenantId } }),
      prisma.expense.findMany({ where: { tenantId } }),
      prisma.receipt.findMany({ where: { tenantId }, include: { allocations: true } }),
      prisma.supplierPayment.findMany({ where: { tenantId }, include: { allocations: true } }),
      prisma.cashSession.findMany({ where: { tenantId } }),
      prisma.setting.findMany({ where: { tenantId } }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      exportVersion: 1,
      tenant,
      branches,
      users,
      roles,
      manufacturers,
      productCategories,
      units,
      suppliers,
      products,
      batches,
      stockTransfers,
      purchaseOrders,
      purchases,
      doctors,
      customers,
      prescriptions,
      sales,
      expenseCategories,
      expenses,
      receipts,
      supplierPayments,
      cashSessions,
      settings,
    };

    recordAudit({ req, module: "settings", action: "export_data", entityType: "Tenant", entityId: tenantId });

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="pharmacy-erp-backup-${tenantId}-${Date.now()}.json"`);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});
