// Adds a richer slate of demo data ON TOP of the existing "Demo Medical Store" tenant (from
// seed.ts) — more products/suppliers/customers/doctors, and purchases + sales spread across the
// last ~2 months so the Dashboard trend chart, Reports, and Reorder Suggestions all have
// something real to show instead of one lonely data point each. Safe to run once; guarded by a
// marker SKU so re-running it is a no-op instead of creating duplicates.
import { prisma } from "../src/lib/prisma";
import { getNextDocumentNumber } from "../src/lib/documentNumber";
import { adjustStock } from "../src/lib/inventory";
import { computePurchaseTotals } from "../src/modules/purchase/purchase.calc";
import { computeSaleLineTotals } from "../src/modules/sales/sales.calc";

const DAY = 86_400_000;
const MARKER_SKU = "COUGH-100";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY);
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { businessName: "Demo Medical Store" } });
  if (!tenant) {
    console.error("Demo Medical Store tenant not found — run `npx tsx prisma/seed.ts` first.");
    process.exitCode = 1;
    return;
  }

  const already = await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: MARKER_SKU } });
  if (already) {
    console.log("Extra demo data already present, skipping.");
    return;
  }

  const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } });
  const owner = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, email: "owner@demo-pharmacy.test" } });
  const manufacturer = await prisma.manufacturer.findFirstOrThrow({ where: { tenantId: tenant.id } });

  // --- More catalog -------------------------------------------------------
  const categoryGeneral = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: "General" } });
  const categoryDiabetes = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: "Diabetes Care" } });
  const unitBottle = await prisma.unit.create({ data: { tenantId: tenant.id, name: "Bottle", shortCode: "BTL" } });
  const unitBox = await prisma.unit.create({ data: { tenantId: tenant.id, name: "Box", shortCode: "BOX" } });

  const supplier2 = await prisma.supplier.create({
    data: { tenantId: tenant.id, name: "HealthFirst Pharma", contactPerson: "Sunita Rao", phone: "9876511111", gstin: "27CCCCC0000C1Z7", creditDays: 15 },
  });
  const supplier3 = await prisma.supplier.create({
    data: { tenantId: tenant.id, name: "Wellness Wholesale", contactPerson: "Vikram Joshi", phone: "9876522222", gstin: "27DDDDD0000D1Z8", creditDays: 45 },
  });

  const products = await Promise.all([
    prisma.product.create({
      data: { tenantId: tenant.id, sku: MARKER_SKU, name: "Cough Syrup 100ml", genericName: "Dextromethorphan", manufacturerId: manufacturer.id, categoryId: categoryGeneral.id, unitId: unitBottle.id, hsnCode: "30049011", gstRatePercent: 12, mrp: 85, purchasePrice: 45, sellingPrice: 70, reorderLevel: 15, maxStockLevel: 100 },
    }),
    prisma.product.create({
      data: { tenantId: tenant.id, sku: "ANTA-200", name: "Antacid Tablets", genericName: "Calcium Carbonate", manufacturerId: manufacturer.id, categoryId: categoryGeneral.id, unitId: unitBox.id, hsnCode: "30049099", gstRatePercent: 12, mrp: 45, purchasePrice: 22, sellingPrice: 35, reorderLevel: 30, maxStockLevel: 150 },
    }),
    prisma.product.create({
      data: { tenantId: tenant.id, sku: "BAND-M", name: "Adhesive Bandages (Medium)", manufacturerId: manufacturer.id, categoryId: categoryGeneral.id, unitId: unitBox.id, hsnCode: "30059010", gstRatePercent: 5, mrp: 60, purchasePrice: 30, sellingPrice: 48, reorderLevel: 10, maxStockLevel: 60 },
    }),
    prisma.product.create({
      data: { tenantId: tenant.id, sku: "INS-10ML", name: "Insulin Injection 10ml", genericName: "Human Insulin", manufacturerId: manufacturer.id, categoryId: categoryDiabetes.id, unitId: unitBottle.id, hsnCode: "30043100", gstRatePercent: 5, requiresPrescription: true, isRefrigerated: true, mrp: 320, purchasePrice: 210, sellingPrice: 290, reorderLevel: 8, maxStockLevel: 40 },
    }),
    prisma.product.create({
      data: { tenantId: tenant.id, sku: "EYED-10ML", name: "Eye Drops 10ml", genericName: "Sodium Chloride", manufacturerId: manufacturer.id, categoryId: categoryGeneral.id, unitId: unitBottle.id, hsnCode: "30049099", gstRatePercent: 12, mrp: 55, purchasePrice: 28, sellingPrice: 42, reorderLevel: 12, maxStockLevel: 80 },
    }),
  ]);
  const [coughSyrup, antacid, bandages, insulin, eyeDrops] = products;

  const doctors = await Promise.all([
    prisma.doctor.create({ data: { tenantId: tenant.id, name: "Dr. Vikram Patel", specialization: "Diabetologist", hospitalClinic: "Metro Diabetes Center" } }),
    prisma.doctor.create({ data: { tenantId: tenant.id, name: "Dr. Priya Nair", specialization: "ENT Specialist", hospitalClinic: "City Health Clinic" } }),
  ]);

  const customers = await Promise.all([
    prisma.customer.create({ data: { tenantId: tenant.id, name: "Sunita Verma", mobile: "9991112222", creditLimit: 1000 } }),
    prisma.customer.create({ data: { tenantId: tenant.id, name: "Rajesh Gupta", mobile: "9991113333", creditLimit: 5000, creditDays: 15 } }),
    prisma.customer.create({ data: { tenantId: tenant.id, name: "Anjali Desai", mobile: "9991114444" } }),
    prisma.customer.create({ data: { tenantId: tenant.id, name: "Mohammed Ismail", mobile: "9991115555", creditLimit: 2000 } }),
  ]);

  // --- Purchases spread across the last ~50 days, from different suppliers ---
  async function recordPurchase(
    supplierId: string,
    daysBack: number,
    items: { productId: string; batchNumber: string; quantity: number; purchaseRate: number; mrp: number; gstRatePercent: number; expiryDays: number }[]
  ) {
    const input = items.map((i) => ({ ...i, discountPercent: 0, expiryDate: daysAgo(-i.expiryDays) }));
    const totals = computePurchaseTotals(input, 0, 0);
    await prisma.$transaction(async (tx) => {
      const referenceNumber = await getNextDocumentNumber(tx, { tenantId: tenant.id, branchId: branch.id, docType: "PURCHASE", prefix: "PUR" });
      const purchase = await tx.purchase.create({
        data: {
          tenantId: tenant.id, branchId: branch.id, supplierId, referenceNumber,
          purchaseDate: daysAgo(daysBack),
          subtotal: totals.subtotal, discountAmount: totals.discountAmount, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount,
          paidAmount: totals.totalAmount, paymentStatus: "PAID", createdById: owner.id,
        },
      });
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const batch = await tx.batch.create({
          data: { tenantId: tenant.id, branchId: branch.id, productId: item.productId, batchNumber: item.batchNumber, supplierId, expiryDate: input[i].expiryDate, purchaseRate: item.purchaseRate, mrp: item.mrp, gstRatePercent: item.gstRatePercent, quantity: 0 },
        });
        await tx.purchaseItem.create({
          data: { purchaseId: purchase.id, productId: item.productId, batchId: batch.id, batchNumber: item.batchNumber, expiryDate: input[i].expiryDate, quantity: item.quantity, purchaseRate: item.purchaseRate, mrp: item.mrp, gstRatePercent: item.gstRatePercent, lineTotal: totals.lines[i].lineTotal },
        });
        await adjustStock(tx, { tenantId: tenant.id, branchId: branch.id, batchId: batch.id, productId: item.productId, quantityDelta: item.quantity, type: "PURCHASE", referenceType: "Purchase", referenceId: purchase.id, createdById: owner.id });
      }
    });
  }

  await recordPurchase(supplier2.id, 50, [
    { productId: coughSyrup.id, batchNumber: "COUGH-A", quantity: 80, purchaseRate: 45, mrp: 85, gstRatePercent: 12, expiryDays: 300 },
    { productId: antacid.id, batchNumber: "ANTA-A", quantity: 120, purchaseRate: 22, mrp: 45, gstRatePercent: 12, expiryDays: 400 },
  ]);
  await recordPurchase(supplier3.id, 35, [
    { productId: bandages.id, batchNumber: "BAND-A", quantity: 50, purchaseRate: 30, mrp: 60, gstRatePercent: 5, expiryDays: 500 },
    { productId: insulin.id, batchNumber: "INS-A", quantity: 20, purchaseRate: 210, mrp: 320, gstRatePercent: 5, expiryDays: 180 },
  ]);
  await recordPurchase(supplier2.id, 20, [
    { productId: eyeDrops.id, batchNumber: "EYED-A", quantity: 40, purchaseRate: 28, mrp: 55, gstRatePercent: 12, expiryDays: 250 },
  ]);
  // Deliberately small, recent restock — leaves coughSyrup and insulin below their reorder
  // levels after the sales below run, so Reorder Suggestions has real rows to show.
  await recordPurchase(supplier2.id, 5, [
    { productId: coughSyrup.id, batchNumber: "COUGH-B", quantity: 10, purchaseRate: 46, mrp: 85, gstRatePercent: 12, expiryDays: 280 },
  ]);

  // --- Sales spread across the last ~45 days, across several products/customers ---
  const saleProducts = [coughSyrup, antacid, bandages, insulin, eyeDrops];
  let saleCount = 0;
  for (let daysBack = 45; daysBack >= 1; daysBack -= 3) {
    const product = saleProducts[saleCount % saleProducts.length];
    const customer = customers[saleCount % customers.length];
    const batch = await prisma.batch.findFirst({ where: { tenantId: tenant.id, productId: product.id }, orderBy: { expiryDate: "asc" } });
    if (!batch || batch.quantity <= 0) {
      saleCount++;
      continue;
    }
    const qty = Math.min(batch.quantity, 2 + (saleCount % 4));
    const line = computeSaleLineTotals({ quantity: qty, sellingPrice: Number(product.sellingPrice), discountPercent: 0, gstRatePercent: Number(batch.gstRatePercent) });

    await prisma.$transaction(async (tx) => {
      const invoiceNumber = await getNextDocumentNumber(tx, { tenantId: tenant.id, branchId: branch.id, docType: "SALE", prefix: branch.invoicePrefix ?? "INV" });
      await tx.sale.create({
        data: {
          tenantId: tenant.id, branchId: branch.id, customerId: customer.id,
          saleDate: daysAgo(daysBack), invoiceNumber,
          subtotal: line.taxableAmount, taxAmount: line.gstAmount, totalAmount: line.lineTotal,
          paidAmount: line.lineTotal, paymentStatus: "PAID", createdById: owner.id,
          items: { create: [{ productId: product.id, batchId: batch.id, quantity: qty, mrp: batch.mrp, sellingPrice: product.sellingPrice, gstRatePercent: batch.gstRatePercent, lineTotal: line.lineTotal }] },
          payments: { create: [{ tenantId: tenant.id, amount: line.lineTotal, paymentMode: saleCount % 3 === 0 ? "UPI" : saleCount % 3 === 1 ? "CASH" : "CARD", paymentDate: daysAgo(daysBack) }] },
        },
      });
      await adjustStock(tx, { tenantId: tenant.id, branchId: branch.id, batchId: batch.id, productId: product.id, quantityDelta: -qty, type: "SALE", createdById: owner.id });
    });
    saleCount++;
  }

  // --- A few more expenses across categories and dates --------------------
  const [electricityCategory, suppliesCategory] = await Promise.all([
    prisma.expenseCategory.create({ data: { tenantId: tenant.id, name: "Electricity" } }),
    prisma.expenseCategory.create({ data: { tenantId: tenant.id, name: "Supplies" } }),
  ]);
  await prisma.expense.createMany({
    data: [
      { tenantId: tenant.id, branchId: branch.id, categoryId: electricityCategory.id, amount: 4200, paymentMode: "BANK_TRANSFER", status: "APPROVED", createdById: owner.id, approvedById: owner.id, description: "Monthly electricity bill", expenseDate: daysAgo(18) },
      { tenantId: tenant.id, branchId: branch.id, categoryId: suppliesCategory.id, amount: 1500, paymentMode: "CASH", status: "APPROVED", createdById: owner.id, approvedById: owner.id, description: "Billing paper rolls & stationery", expenseDate: daysAgo(10) },
      { tenantId: tenant.id, branchId: branch.id, categoryId: suppliesCategory.id, amount: 2800, paymentMode: "CASH", status: "PENDING", createdById: owner.id, description: "Store cleaning supplies", expenseDate: daysAgo(2) },
    ],
  });

  const finalSaleCount = await prisma.sale.count({ where: { tenantId: tenant.id } });
  console.log("Extra demo data seeded.");
  console.log(`Added: 5 products, 2 suppliers, 2 doctors, 4 customers, 4 purchases, ${saleCount} sale attempts (${finalSaleCount} total sales now), 3 expenses.`);
  console.log("Cough Syrup and Insulin are intentionally low on stock — check Reorder Suggestions.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
