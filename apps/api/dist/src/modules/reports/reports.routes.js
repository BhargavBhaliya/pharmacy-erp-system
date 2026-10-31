"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const csv_1 = require("../../lib/csv");
const errors_1 = require("../../lib/errors");
const dateParam_1 = require("../../lib/dateParam");
exports.reportsRouter = (0, express_1.Router)();
exports.reportsRouter.use(auth_1.authenticate);
// These report queries aggregate in application code (not a DB-side groupBy) and have no other
// cap, so an unrestricted date range on a tenant with years of history could pull an unbounded,
// ever-growing result set into memory. This is a safety net, not a real pagination story — a
// tenant big enough to hit it should narrow the date range or (longer-term) this should move to
// prisma.groupBy()-based aggregation instead of loading full rows.
const REPORT_ROW_CAP = 20_000;
// A caller-supplied branchId must still be one of the user's own branches — without this check
// a user restricted to one branch could pass any other branch's id in this same tenant and read
// its sales/purchases/expenses/stock figures.
function branchScope(req, branchId) {
    if (branchId) {
        if (!req.user.branchIds.includes(branchId))
            throw new errors_1.ForbiddenError("You do not have access to this branch");
        return branchId;
    }
    return { in: req.user.branchIds };
}
function dateRange(fromStr, toStr) {
    const to = (0, dateParam_1.parseDateParam)(toStr, "to") ?? new Date();
    const from = (0, dateParam_1.parseDateParam)(fromStr, "from") ?? new Date(to.getTime() - 30 * 86_400_000);
    to.setHours(23, 59, 59, 999);
    return { from, to };
}
// Shared "bucket by day/month/year" key+label for the time-based groupBy options across
// sales, purchases, and expenses reports.
function dateBucket(date, granularity) {
    const iso = date.toISOString();
    if (granularity === "year")
        return iso.slice(0, 4);
    if (granularity === "month")
        return iso.slice(0, 7);
    return iso.slice(0, 10);
}
function respond(req, res, rows, columns, filename) {
    if (req.query.format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
        return res.send((0, csv_1.toCsv)(rows, columns));
    }
    res.json({ data: rows });
}
const salesReportQuery = zod_1.z.object({
    from: zod_1.z.string().optional(),
    to: zod_1.z.string().optional(),
    branchId: zod_1.z.string().optional(),
    groupBy: zod_1.z.enum(["day", "month", "year", "product", "category", "user", "customer", "doctor"]).default("day"),
});
exports.reportsRouter.get("/sales", (0, auth_1.requirePermission)("reports", "view"), async (req, res, next) => {
    try {
        const q = salesReportQuery.parse(req.query);
        const { from, to } = dateRange(q.from, q.to);
        const sales = await prisma_1.prisma.sale.findMany({
            where: { tenantId: req.user.tenantId, branchId: branchScope(req, q.branchId), status: "CONFIRMED", saleDate: { gte: from, lte: to } },
            include: { items: { include: { product: { include: { category: true } } } }, customer: true, doctor: true },
            take: REPORT_ROW_CAP,
        });
        const userIds = [...new Set(sales.map((s) => s.createdById).filter((id) => Boolean(id)))];
        const users = await prisma_1.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
        const userNameById = new Map(users.map((u) => [u.id, u.name]));
        const buckets = new Map();
        const bump = (key, label, amount, quantity, countOnce) => {
            const b = buckets.get(key) ?? { label, totalAmount: 0, quantity: 0, count: 0 };
            b.totalAmount += amount;
            b.quantity += quantity;
            if (countOnce)
                b.count += 1;
            buckets.set(key, b);
        };
        for (const sale of sales) {
            const total = Number(sale.totalAmount);
            switch (q.groupBy) {
                case "day":
                case "month":
                case "year": {
                    const key = dateBucket(sale.saleDate, q.groupBy);
                    bump(key, key, total, sale.items.reduce((s, i) => s + i.quantity, 0), true);
                    break;
                }
                case "user": {
                    const key = sale.createdById ?? "unknown";
                    bump(key, userNameById.get(key) ?? "Unknown", total, sale.items.reduce((s, i) => s + i.quantity, 0), true);
                    break;
                }
                case "customer": {
                    const key = sale.customerId ?? "walk-in";
                    bump(key, sale.customer?.name ?? "Walk-in", total, sale.items.reduce((s, i) => s + i.quantity, 0), true);
                    break;
                }
                case "doctor": {
                    const key = sale.doctorId ?? "none";
                    bump(key, sale.doctor?.name ?? "—", total, sale.items.reduce((s, i) => s + i.quantity, 0), true);
                    break;
                }
                case "product": {
                    for (const item of sale.items) {
                        bump(item.productId, item.product.name, Number(item.lineTotal), item.quantity, false);
                    }
                    break;
                }
                case "category": {
                    for (const item of sale.items) {
                        const key = item.product.categoryId ?? "uncategorized";
                        bump(key, item.product.category?.name ?? "Uncategorized", Number(item.lineTotal), item.quantity, false);
                    }
                    break;
                }
            }
        }
        const rows = Array.from(buckets.entries())
            .map(([key, v]) => ({ key, label: v.label, totalAmount: round2(v.totalAmount), quantity: v.quantity, invoiceCount: v.count || undefined }))
            .sort((a, b) => b.totalAmount - a.totalAmount);
        respond(req, res, rows, ["key", "label", "totalAmount", "quantity", "invoiceCount"], `sales-by-${q.groupBy}`);
    }
    catch (err) {
        next(err);
    }
});
const purchaseReportQuery = zod_1.z.object({
    from: zod_1.z.string().optional(),
    to: zod_1.z.string().optional(),
    branchId: zod_1.z.string().optional(),
    groupBy: zod_1.z.enum(["day", "month", "year", "product", "supplier"]).default("day"),
});
exports.reportsRouter.get("/purchases", (0, auth_1.requirePermission)("reports", "view"), async (req, res, next) => {
    try {
        const q = purchaseReportQuery.parse(req.query);
        const { from, to } = dateRange(q.from, q.to);
        const purchases = await prisma_1.prisma.purchase.findMany({
            where: { tenantId: req.user.tenantId, branchId: branchScope(req, q.branchId), status: "CONFIRMED", purchaseDate: { gte: from, lte: to } },
            include: { items: { include: { product: true } }, supplier: true },
            take: REPORT_ROW_CAP,
        });
        const buckets = new Map();
        const bump = (key, label, amount, quantity) => {
            const b = buckets.get(key) ?? { label, totalAmount: 0, quantity: 0 };
            b.totalAmount += amount;
            b.quantity += quantity;
            buckets.set(key, b);
        };
        for (const purchase of purchases) {
            if (q.groupBy === "day" || q.groupBy === "month" || q.groupBy === "year") {
                const key = dateBucket(purchase.purchaseDate, q.groupBy);
                bump(key, key, Number(purchase.totalAmount), purchase.items.reduce((s, i) => s + i.quantity, 0));
            }
            else if (q.groupBy === "supplier") {
                bump(purchase.supplierId, purchase.supplier.name, Number(purchase.totalAmount), purchase.items.reduce((s, i) => s + i.quantity, 0));
            }
            else {
                for (const item of purchase.items) {
                    bump(item.productId, item.product.name, Number(item.lineTotal), item.quantity);
                }
            }
        }
        const rows = Array.from(buckets.entries())
            .map(([key, v]) => ({ key, label: v.label, totalAmount: round2(v.totalAmount), quantity: v.quantity }))
            .sort((a, b) => b.totalAmount - a.totalAmount);
        respond(req, res, rows, ["key", "label", "totalAmount", "quantity"], `purchases-by-${q.groupBy}`);
    }
    catch (err) {
        next(err);
    }
});
const expenseReportQuery = zod_1.z.object({
    from: zod_1.z.string().optional(),
    to: zod_1.z.string().optional(),
    branchId: zod_1.z.string().optional(),
    groupBy: zod_1.z.enum(["day", "month", "year", "category", "branch", "paymentMode"]).default("day"),
});
exports.reportsRouter.get("/expenses", (0, auth_1.requirePermission)("reports", "view"), async (req, res, next) => {
    try {
        const q = expenseReportQuery.parse(req.query);
        const { from, to } = dateRange(q.from, q.to);
        const expenses = await prisma_1.prisma.expense.findMany({
            where: {
                tenantId: req.user.tenantId,
                branchId: branchScope(req, q.branchId),
                status: "APPROVED",
                expenseDate: { gte: from, lte: to },
            },
            include: { category: true, branch: { select: { id: true, name: true } } },
            take: REPORT_ROW_CAP,
        });
        const buckets = new Map();
        const bump = (key, label, amount) => {
            const b = buckets.get(key) ?? { label, totalAmount: 0, count: 0 };
            b.totalAmount += amount;
            b.count += 1;
            buckets.set(key, b);
        };
        for (const expense of expenses) {
            const amount = Number(expense.amount);
            switch (q.groupBy) {
                case "day":
                case "month":
                case "year": {
                    const key = dateBucket(expense.expenseDate, q.groupBy);
                    bump(key, key, amount);
                    break;
                }
                case "category":
                    bump(expense.categoryId, expense.category.name, amount);
                    break;
                case "branch":
                    bump(expense.branchId, expense.branch.name, amount);
                    break;
                case "paymentMode":
                    bump(expense.paymentMode, expense.paymentMode, amount);
                    break;
            }
        }
        const rows = Array.from(buckets.entries())
            .map(([key, v]) => ({ key, label: v.label, totalAmount: round2(v.totalAmount), expenseCount: v.count }))
            .sort((a, b) => b.totalAmount - a.totalAmount);
        respond(req, res, rows, ["key", "label", "totalAmount", "expenseCount"], `expenses-by-${q.groupBy}`);
    }
    catch (err) {
        next(err);
    }
});
const inventoryReportQuery = zod_1.z.object({ branchId: zod_1.z.string().optional() });
exports.reportsRouter.get("/inventory/stock-valuation", (0, auth_1.requirePermission)("reports", "view"), async (req, res, next) => {
    try {
        const q = inventoryReportQuery.parse(req.query);
        const batches = await prisma_1.prisma.batch.findMany({
            where: { tenantId: req.user.tenantId, branchId: branchScope(req, q.branchId), quantity: { gt: 0 } },
            include: { product: { select: { id: true, name: true, sku: true } } },
        });
        const byProduct = new Map();
        for (const b of batches) {
            const key = b.productId;
            const entry = byProduct.get(key) ?? { label: b.product.name, sku: b.product.sku, quantity: 0, stockValueAtCost: 0, stockValueAtMrp: 0 };
            entry.quantity += b.quantity;
            entry.stockValueAtCost += b.quantity * Number(b.purchaseRate);
            entry.stockValueAtMrp += b.quantity * Number(b.mrp);
            byProduct.set(key, entry);
        }
        const rows = Array.from(byProduct.entries())
            .map(([key, v]) => ({ key, label: v.label, sku: v.sku, quantity: v.quantity, stockValueAtCost: round2(v.stockValueAtCost), stockValueAtMrp: round2(v.stockValueAtMrp) }))
            .sort((a, b) => b.stockValueAtCost - a.stockValueAtCost);
        respond(req, res, rows, ["key", "label", "sku", "quantity", "stockValueAtCost", "stockValueAtMrp"], "stock-valuation");
    }
    catch (err) {
        next(err);
    }
});
const movementQuery = zod_1.z.object({ branchId: zod_1.z.string().optional(), days: zod_1.z.coerce.number().int().min(1).max(365).default(30) });
// Classifies products by units sold in the trailing window vs current stock: fast movers,
// slow movers, and non-moving (in stock but nothing sold at all in the window).
exports.reportsRouter.get("/inventory/movement", (0, auth_1.requirePermission)("reports", "view"), async (req, res, next) => {
    try {
        const q = movementQuery.parse(req.query);
        const since = new Date(Date.now() - q.days * 86_400_000);
        const [saleItems, stockRows] = await Promise.all([
            prisma_1.prisma.saleItem.findMany({
                where: { sale: { tenantId: req.user.tenantId, branchId: branchScope(req, q.branchId), status: "CONFIRMED", saleDate: { gte: since } } },
                include: { product: { select: { id: true, name: true, sku: true } } },
            }),
            prisma_1.prisma.batch.groupBy({
                by: ["productId"],
                where: { tenantId: req.user.tenantId, branchId: branchScope(req, q.branchId), quantity: { gt: 0 } },
                _sum: { quantity: true },
            }),
        ]);
        const soldByProduct = new Map();
        for (const item of saleItems) {
            const entry = soldByProduct.get(item.productId) ?? { label: item.product.name, sku: item.product.sku, unitsSold: 0 };
            entry.unitsSold += item.quantity;
            soldByProduct.set(item.productId, entry);
        }
        const stockByProduct = new Map(stockRows.map((r) => [r.productId, r._sum.quantity ?? 0]));
        const productIds = new Set([...soldByProduct.keys(), ...stockByProduct.keys()]);
        const products = await prisma_1.prisma.product.findMany({ where: { id: { in: Array.from(productIds) } }, select: { id: true, name: true, sku: true } });
        const productById = new Map(products.map((p) => [p.id, p]));
        const rows = Array.from(productIds).map((id) => {
            const unitsSold = soldByProduct.get(id)?.unitsSold ?? 0;
            const currentStock = stockByProduct.get(id) ?? 0;
            const classification = currentStock === 0 ? "OUT_OF_STOCK" : unitsSold === 0 ? "NON_MOVING" : unitsSold >= 20 ? "FAST_MOVING" : "SLOW_MOVING";
            return { key: id, label: productById.get(id)?.name ?? soldByProduct.get(id)?.label ?? "Unknown", sku: productById.get(id)?.sku ?? "", unitsSold, currentStock, classification };
        });
        rows.sort((a, b) => b.unitsSold - a.unitsSold);
        respond(req, res, rows, ["key", "label", "sku", "unitsSold", "currentStock", "classification"], "stock-movement");
    }
    catch (err) {
        next(err);
    }
});
function round2(n) {
    return Math.round(n * 100) / 100;
}
