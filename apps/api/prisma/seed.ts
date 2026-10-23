// Development-only demo data (spec section 50). Never run against a production database.
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { seedDefaultRolesForTenant } from "../src/lib/tenantSetup";
import { nextStoreCode } from "../src/lib/storeCode";
import { getNextDocumentNumber } from "../src/lib/documentNumber";
import { adjustStock } from "../src/lib/inventory";
import { computePurchaseTotals } from "../src/modules/purchase/purchase.calc";
import { computeSaleLineTotals } from "../src/modules/sales/sales.calc";

const DEMO_PASSWORD = "Demo@12345";
const DAY = 86_400_000;

async function main() {
  const existing = await prisma.tenant.findFirst({ where: { businessName: "Demo Medical Store" } });
  if (existing) {
    console.log("Demo tenant already exists, skipping seed. Tenant id:", existing.id);
    return;
  }

  const storeCode = await nextStoreCode(prisma);
  const tenant = await prisma.tenant.create({
    data: {
      businessName: "Demo Medical Store",
      legalName: "Demo Medical Store Pvt Ltd",
      ownerName: "Demo Owner",
      email: "owner@demo-pharmacy.test",
      gstin: "27AAAAA0000A1Z5",
      state: "Maharashtra",
      city: "Pune",
      storeCode,
    },
  });

  const branch = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Main Branch", invoicePrefix: "INV", gstin: tenant.gstin },
  });
  await prisma.warehouse.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Main Warehouse" } });
  await prisma.counter.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Counter 1" } });

  const roleIdByName = await seedDefaultRolesForTenant(tenant.id);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const demoUsers: Array<{ name: string; email: string; username: string; role: string }> = [
    { name: "Demo Owner", email: "owner@demo-pharmacy.test", username: "owner", role: "Super Admin" },
    { name: "Demo Manager", email: "manager@demo-pharmacy.test", username: "manager", role: "Branch Manager" },
    { name: "Demo Pharmacist", email: "pharmacist@demo-pharmacy.test", username: "pharmacist", role: "Pharmacist" },
    { name: "Demo Cashier", email: "cashier@demo-pharmacy.test", username: "cashier", role: "Billing/Cashier" },
  ];

  let ownerUserId = "";
  for (const u of demoUsers) {
    const roleId = roleIdByName.get(u.role as never);
    if (!roleId) continue;
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, name: u.name, email: u.email, username: u.username, passwordHash, roleId, userBranches: { create: [{ branchId: branch.id }] } },
    });
    if (u.role === "Super Admin") ownerUserId = user.id;
  }

  // --- Catalog ---------------------------------------------------------
  const manufacturer = await prisma.manufacturer.create({ data: { tenantId: tenant.id, name: "Cipla" } });
  const categoryPain = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: "Pain Relief" } });
  const categoryAntibiotic = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: "Antibiotics" } });
  const unitStrip = await prisma.unit.create({ data: { tenantId: tenant.id, name: "Strip", shortCode: "STR" } });

  const supplier = await prisma.supplier.create({
    data: { tenantId: tenant.id, name: "MedSupply Distributors", contactPerson: "Rajesh Mehta", phone: "9876500000", gstin: "27BBBBB0000B1Z6", creditDays: 30 },
  });

  const paracetamol = await prisma.product.create({
    data: {
      tenantId: tenant.id, sku: "PARA-500", name: "Paracetamol 500mg", genericName: "Paracetamol",
      manufacturerId: manufacturer.id, categoryId: categoryPain.id, unitId: unitStrip.id,
      hsnCode: "30049099", gstRatePercent: 12, mrp: 25, purchasePrice: 12, sellingPrice: 18, reorderLevel: 50,
    },
  });
  const amoxicillin = await prisma.product.create({
    data: {
      tenantId: tenant.id, sku: "AMOX-250", name: "Amoxicillin 250mg", genericName: "Amoxicillin",
      manufacturerId: manufacturer.id, categoryId: categoryAntibiotic.id, unitId: unitStrip.id,
      hsnCode: "30041000", gstRatePercent: 12, requiresPrescription: true, mrp: 60, purchasePrice: 30, sellingPrice: 45, reorderLevel: 20,
    },
  });
  const vitaminC = await prisma.product.create({
    data: {
      tenantId: tenant.id, sku: "VITC-500", name: "Vitamin C 500mg", genericName: "Ascorbic Acid",
      manufacturerId: manufacturer.id, unitId: unitStrip.id,
      hsnCode: "29362700", gstRatePercent: 5, mrp: 40, purchasePrice: 20, sellingPrice: 30, reorderLevel: 10,
    },
  });

  const doctor = await prisma.doctor.create({ data: { tenantId: tenant.id, name: "Dr. Anita Sharma", specialization: "General Physician", hospitalClinic: "City Health Clinic" } });
  const customer = await prisma.customer.create({ data: { tenantId: tenant.id, name: "Ramesh Kumar", mobile: "9998887777", creditLimit: 2000, doctorId: doctor.id } });

  // --- A real purchase (books stock via the same logic as the API) -----
  const purchaseItemsInput = [
    { productId: paracetamol.id, batchNumber: "PARA-2026-A", quantity: 200, purchaseRate: 12, mrp: 25, discountPercent: 0, gstRatePercent: 12, expiryDate: new Date(Date.now() + 365 * DAY) },
    { productId: amoxicillin.id, batchNumber: "AMOX-2026-A", quantity: 15, purchaseRate: 30, mrp: 60, discountPercent: 0, gstRatePercent: 12, expiryDate: new Date(Date.now() + 20 * DAY) }, // near-expiry demo + low stock demo
    { productId: vitaminC.id, batchNumber: "VITC-2025-EXP", quantity: 30, purchaseRate: 20, mrp: 40, discountPercent: 0, gstRatePercent: 5, expiryDate: new Date(Date.now() - 5 * DAY) }, // already-expired demo
  ];
  const purchaseTotals = computePurchaseTotals(purchaseItemsInput, 0, 0);

  await prisma.$transaction(async (tx) => {
    const referenceNumber = await getNextDocumentNumber(tx, { tenantId: tenant.id, branchId: branch.id, docType: "PURCHASE", prefix: "PUR" });
    const purchase = await tx.purchase.create({
      data: {
        tenantId: tenant.id, branchId: branch.id, supplierId: supplier.id, referenceNumber,
        supplierInvoiceNumber: "MSD-INV-1001",
        subtotal: purchaseTotals.subtotal, discountAmount: purchaseTotals.discountAmount, taxAmount: purchaseTotals.taxAmount,
        totalAmount: purchaseTotals.totalAmount, createdById: ownerUserId,
      },
    });

    for (let i = 0; i < purchaseItemsInput.length; i++) {
      const item = purchaseItemsInput[i];
      const batch = await tx.batch.create({
        data: {
          tenantId: tenant.id, branchId: branch.id, productId: item.productId, batchNumber: item.batchNumber,
          supplierId: supplier.id, expiryDate: item.expiryDate, purchaseRate: item.purchaseRate, mrp: item.mrp,
          gstRatePercent: item.gstRatePercent, quantity: 0,
        },
      });
      await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id, productId: item.productId, batchId: batch.id, batchNumber: item.batchNumber,
          expiryDate: item.expiryDate, quantity: item.quantity, purchaseRate: item.purchaseRate, mrp: item.mrp,
          gstRatePercent: item.gstRatePercent, lineTotal: purchaseTotals.lines[i].lineTotal,
        },
      });
      await adjustStock(tx, { tenantId: tenant.id, branchId: branch.id, batchId: batch.id, productId: item.productId, quantityDelta: item.quantity, type: "PURCHASE", referenceType: "Purchase", referenceId: purchase.id, createdById: ownerUserId });
    }
  });

  // --- A real sale against the paracetamol batch just purchased ---------
  const paraBatch = await prisma.batch.findFirstOrThrow({ where: { tenantId: tenant.id, productId: paracetamol.id, batchNumber: "PARA-2026-A" } });
  const saleQty = 10;
  const saleLine = computeSaleLineTotals({ quantity: saleQty, sellingPrice: Number(paracetamol.sellingPrice), discountPercent: 0, gstRatePercent: Number(paraBatch.gstRatePercent) });

  await prisma.$transaction(async (tx) => {
    const invoiceNumber = await getNextDocumentNumber(tx, { tenantId: tenant.id, branchId: branch.id, docType: "SALE", prefix: branch.invoicePrefix ?? "INV" });
    await tx.sale.create({
      data: {
        tenantId: tenant.id, branchId: branch.id, customerId: customer.id, doctorId: doctor.id,
        invoiceNumber, subtotal: saleLine.taxableAmount, taxAmount: saleLine.gstAmount, totalAmount: saleLine.lineTotal,
        paidAmount: saleLine.lineTotal, paymentStatus: "PAID", createdById: ownerUserId,
        items: { create: [{ productId: paracetamol.id, batchId: paraBatch.id, quantity: saleQty, mrp: paraBatch.mrp, sellingPrice: paracetamol.sellingPrice, gstRatePercent: paraBatch.gstRatePercent, lineTotal: saleLine.lineTotal }] },
        payments: { create: [{ tenantId: tenant.id, amount: saleLine.lineTotal, paymentMode: "CASH" }] },
      },
    });
    await adjustStock(tx, { tenantId: tenant.id, branchId: branch.id, batchId: paraBatch.id, productId: paracetamol.id, quantityDelta: -saleQty, type: "SALE", createdById: ownerUserId });
  });

  // --- One expense category + entry -------------------------------------
  const rentCategory = await prisma.expenseCategory.create({ data: { tenantId: tenant.id, name: "Rent" } });
  await prisma.expense.create({
    data: { tenantId: tenant.id, branchId: branch.id, categoryId: rentCategory.id, amount: 15000, paymentMode: "BANK_TRANSFER", status: "APPROVED", createdById: ownerUserId, approvedById: ownerUserId, description: "Monthly shop rent" },
  });

  console.log("Seed complete.");
  console.log("Demo data: 3 products, 1 supplier, 1 purchase (with a near-expiry and an already-expired batch), 1 sale, 1 customer, 1 doctor, 1 expense.");
  console.log("Demo login credentials (development only) — sign in with either the email or the username:");
  for (const u of demoUsers) {
    console.log(`  ${u.role.padEnd(16)} ${u.email} (or "${u.username}")  /  ${DEMO_PASSWORD}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
