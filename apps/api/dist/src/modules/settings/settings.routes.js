"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const audit_1 = require("../../lib/audit");
const node_fs_1 = __importDefault(require("node:fs"));
const upload_1 = require("../../lib/upload");
const errors_1 = require("../../lib/errors");
const settings_validation_1 = require("./settings.validation");
exports.settingsRouter = (0, express_1.Router)();
exports.settingsRouter.use(auth_1.authenticate);
// Read-only branding info needed to render printable invoices/labels. Deliberately open to any
// authenticated user (no settings.view check) — a cashier printing a receipt shouldn't need
// settings access just to show the business name/GSTIN in the header.
exports.settingsRouter.get("/branding", async (req, res, next) => {
    try {
        const tenant = await prisma_1.prisma.tenant.findUniqueOrThrow({
            where: { id: req.user.tenantId },
            select: {
                businessName: true,
                legalName: true,
                gstin: true,
                whatsappNumber: true,
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
    }
    catch (err) {
        next(err);
    }
});
exports.settingsRouter.get("/business", (0, auth_1.requirePermission)("settings", "view"), async (req, res, next) => {
    try {
        const tenant = await prisma_1.prisma.tenant.findUniqueOrThrow({ where: { id: req.user.tenantId } });
        res.json({ data: tenant });
    }
    catch (err) {
        next(err);
    }
});
exports.settingsRouter.put("/business", (0, auth_1.requirePermission)("settings", "edit"), (0, validate_1.validateBody)(settings_validation_1.updateBusinessProfileSchema), async (req, res, next) => {
    try {
        const before = await prisma_1.prisma.tenant.findUniqueOrThrow({ where: { id: req.user.tenantId } });
        const tenant = await prisma_1.prisma.tenant.update({ where: { id: req.user.tenantId }, data: req.body });
        (0, audit_1.recordAudit)({ req, module: "settings", action: "update_business_profile", entityType: "Tenant", entityId: tenant.id, oldValue: before, newValue: tenant });
        res.json({ data: tenant });
    }
    catch (err) {
        next(err);
    }
});
function handleBrandingImageUpload(field, auditAction) {
    return [
        (0, auth_1.requirePermission)("settings", "edit"),
        upload_1.imageUpload.single("file"),
        async (req, res, next) => {
            try {
                if (!req.file)
                    throw new errors_1.ValidationError("No file uploaded");
                const tenantId = req.user.tenantId;
                if (!(0, upload_1.verifyImageMagicBytes)(req.file.path, req.file.mimetype)) {
                    node_fs_1.default.unlink(req.file.path, () => undefined);
                    throw new errors_1.ValidationError("File content doesn't match a valid JPEG, PNG, or WebP image");
                }
                const before = await prisma_1.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
                const url = (0, upload_1.publicUploadUrl)(tenantId, req.file.filename);
                const tenant = await prisma_1.prisma.tenant.update({ where: { id: tenantId }, data: { [field]: url } });
                // Best-effort: remove the old file now that it's no longer referenced. Never blocks
                // the response on this — an orphaned file on disk is a non-issue, a failed response isn't.
                (0, upload_1.deleteUploadedFileIfOwned)(tenantId, before[field]);
                (0, audit_1.recordAudit)({ req, module: "settings", action: auditAction, entityType: "Tenant", entityId: tenantId });
                res.status(201).json({ data: { url } });
            }
            catch (err) {
                next(err);
            }
        },
    ];
}
exports.settingsRouter.post("/upload-logo", ...handleBrandingImageUpload("logoUrl", "upload_logo"));
exports.settingsRouter.post("/upload-signature", ...handleBrandingImageUpload("signatureUrl", "upload_signature"));
// Generic tenant/branch-scoped key-value settings (e.g. "expiryWarningDays"), backing the
// Setting model from Phase 1. branchId in the body scopes it to one branch; omit for tenant-wide.
exports.settingsRouter.get("/:key", (0, auth_1.requirePermission)("settings", "view"), async (req, res, next) => {
    try {
        const branchId = typeof req.query.branchId === "string" ? req.query.branchId : null;
        const setting = await prisma_1.prisma.setting.findFirst({ where: { tenantId: req.user.tenantId, branchId, key: req.params.key } });
        res.json({ data: setting?.value ?? null });
    }
    catch (err) {
        next(err);
    }
});
exports.settingsRouter.put("/:key", (0, auth_1.requirePermission)("settings", "edit"), (0, validate_1.validateBody)(settings_validation_1.updateSettingSchema), async (req, res, next) => {
    try {
        const branchId = req.body.branchId ?? null;
        // Prisma's compound-unique `where` shorthand rejects null components (SQL NULL isn't
        // equal to NULL), so a tenant-wide setting (branchId: null) needs a manual find + create/update.
        const existing = await prisma_1.prisma.setting.findFirst({ where: { tenantId: req.user.tenantId, branchId, key: req.params.key } });
        const setting = existing
            ? await prisma_1.prisma.setting.update({ where: { id: existing.id }, data: { value: req.body.value } })
            : await prisma_1.prisma.setting.create({ data: { tenantId: req.user.tenantId, branchId, key: req.params.key, value: req.body.value } });
        (0, audit_1.recordAudit)({ req, module: "settings", action: "update_setting", entityType: "Setting", entityId: setting.id, newValue: { key: req.params.key, value: req.body.value } });
        res.json({ data: setting });
    }
    catch (err) {
        next(err);
    }
});
// Tenant-scoped data export ("backup"). A raw pg_dump would leak other tenants' rows since
// this is a shared database, so instead we export exactly this tenant's own data as JSON.
// See README "Known limitations" — there is no restore-from-export yet.
exports.settingsRouter.get("/export/data", (0, auth_1.requirePermission)("settings", "edit"), async (req, res, next) => {
    try {
        const tenantId = req.user.tenantId;
        const [tenant, branches, users, roles, manufacturers, productCategories, units, suppliers, products, batches, stockTransfers, purchaseOrders, purchases, doctors, customers, prescriptions, sales, expenseCategories, expenses, receipts, supplierPayments, cashSessions, settings,] = await Promise.all([
            prisma_1.prisma.tenant.findUnique({ where: { id: tenantId } }),
            prisma_1.prisma.branch.findMany({ where: { tenantId }, include: { warehouses: true, counters: true } }),
            prisma_1.prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true, email: true, phone: true, roleId: true, isActive: true, createdAt: true } }),
            prisma_1.prisma.role.findMany({ where: { tenantId }, include: { rolePermissions: { include: { permission: true } } } }),
            prisma_1.prisma.manufacturer.findMany({ where: { tenantId } }),
            prisma_1.prisma.productCategory.findMany({ where: { tenantId } }),
            prisma_1.prisma.unit.findMany({ where: { tenantId } }),
            prisma_1.prisma.supplier.findMany({ where: { tenantId } }),
            prisma_1.prisma.product.findMany({ where: { tenantId }, include: { barcodes: true } }),
            prisma_1.prisma.batch.findMany({ where: { tenantId } }),
            prisma_1.prisma.stockTransfer.findMany({ where: { tenantId }, include: { items: true } }),
            prisma_1.prisma.purchaseOrder.findMany({ where: { tenantId }, include: { items: true } }),
            prisma_1.prisma.purchase.findMany({ where: { tenantId }, include: { items: true, payments: true, returns: { include: { items: true } } } }),
            prisma_1.prisma.doctor.findMany({ where: { tenantId } }),
            prisma_1.prisma.customer.findMany({ where: { tenantId } }),
            prisma_1.prisma.prescription.findMany({ where: { tenantId }, include: { items: true } }),
            prisma_1.prisma.sale.findMany({ where: { tenantId }, include: { items: true, payments: true, returns: { include: { items: true } } } }),
            prisma_1.prisma.expenseCategory.findMany({ where: { tenantId } }),
            prisma_1.prisma.expense.findMany({ where: { tenantId } }),
            prisma_1.prisma.receipt.findMany({ where: { tenantId }, include: { allocations: true } }),
            prisma_1.prisma.supplierPayment.findMany({ where: { tenantId }, include: { allocations: true } }),
            prisma_1.prisma.cashSession.findMany({ where: { tenantId } }),
            prisma_1.prisma.setting.findMany({ where: { tenantId } }),
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
        (0, audit_1.recordAudit)({ req, module: "settings", action: "export_data", entityType: "Tenant", entityId: tenantId });
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="pharmacy-erp-backup-${tenantId}-${Date.now()}.json"`);
        res.json(payload);
    }
    catch (err) {
        next(err);
    }
});
