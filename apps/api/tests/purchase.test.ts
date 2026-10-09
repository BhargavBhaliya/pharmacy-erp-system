import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { uniqueEmail, deleteTenant } from "./helpers";

const createdTenantIds: string[] = [];

afterAll(async () => {
  for (const id of createdTenantIds) await deleteTenant(id);
  await prisma.$disconnect();
});

async function setupTenant(businessName: string) {
  const email = uniqueEmail("owner");
  const reg = await request(app).post("/api/auth/register-business").send({
    businessName,
    ownerName: "Owner",
    email,
    password: "Password123!",
  });
  createdTenantIds.push(reg.body.tenant.id);
  const login = await request(app).post("/api/auth/login").send({ email, password: "Password123!" });
  return { tenantId: reg.body.tenant.id, branchId: reg.body.branch.id, token: login.body.accessToken as string };
}

async function createProduct(token: string) {
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ sku: `SKU-${Math.random().toString(36).slice(2, 8)}`, name: "Amoxicillin 250mg", mrp: 50, purchasePrice: 30, sellingPrice: 40 });
  return res.body.data;
}

async function createSupplier(token: string) {
  const res = await request(app).post("/api/suppliers").set("Authorization", `Bearer ${token}`).send({ name: `Supplier ${Math.random().toString(36).slice(2, 6)}` });
  return res.body.data;
}

describe("purchase workflow", () => {
  it("creates a purchase order with a formatted, FY-scoped order number", async () => {
    const t = await setupTenant("Purchase Pharmacy 1");
    const product = await createProduct(t.token);
    const supplier = await createSupplier(t.token);

    const res = await request(app)
      .post("/api/purchase-orders")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, supplierId: supplier.id, items: [{ productId: product.id, quantity: 100, rate: 30 }] });

    expect(res.status).toBe(201);
    expect(res.body.data.orderNumber).toMatch(/^PO\/\d{4}-\d{2}\/\d{6}$/);
    expect(res.body.data.status).toBe("SENT");
  });

  // Regression test: "purchase.cancel" was missing from the purchase module's action catalog,
  // so this permission could never actually be granted to any role — not even Super Admin's
  // "*.*" wildcard — making the cancel-PO route unreachable for everyone, in every tenant.
  it("a Super Admin can cancel a purchase order", async () => {
    const t = await setupTenant("Purchase Pharmacy 6");
    const product = await createProduct(t.token);
    const supplier = await createSupplier(t.token);

    const create = await request(app)
      .post("/api/purchase-orders")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, supplierId: supplier.id, items: [{ productId: product.id, quantity: 10, rate: 30 }] });
    expect(create.status).toBe(201);

    const cancel = await request(app)
      .put(`/api/purchase-orders/${create.body.data.id}/cancel`)
      .set("Authorization", `Bearer ${t.token}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe("CANCELLED");
  });

  it("recording a purchase creates/updates batches, increases stock, and computes GST totals correctly", async () => {
    const t = await setupTenant("Purchase Pharmacy 2");
    const product = await createProduct(t.token);
    const supplier = await createSupplier(t.token);

    const res = await request(app)
      .post("/api/purchases")
      .set("Authorization", `Bearer ${t.token}`)
      .send({
        branchId: t.branchId,
        supplierId: supplier.id,
        supplierInvoiceNumber: "SUP-INV-001",
        items: [
          {
            productId: product.id,
            batchNumber: "AMX-001",
            expiryDate: new Date(Date.now() + 365 * 86_400_000).toISOString(),
            quantity: 100,
            freeQuantity: 10,
            purchaseRate: 30,
            mrp: 50,
            discountPercent: 10,
            gstRatePercent: 12,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.referenceNumber).toMatch(/^PUR\/\d{4}-\d{2}\/\d{6}$/);

    // base = 100*30=3000, discount 10% = 300, taxable = 2700, gst 12% = 324, total = 3024
    expect(Number(res.body.data.subtotal)).toBeCloseTo(2700);
    expect(Number(res.body.data.taxAmount)).toBeCloseTo(324);
    expect(Number(res.body.data.totalAmount)).toBeCloseTo(3024);
    expect(res.body.data.paymentStatus).toBe("UNPAID");

    const stock = await request(app)
      .get(`/api/inventory/stock?branchId=${t.branchId}&productId=${product.id}`)
      .set("Authorization", `Bearer ${t.token}`);
    expect(stock.body.data[0].availableQuantity).toBe(110); // 100 + 10 free
  });

  it("adding more stock against the same batch number accumulates quantity on the same batch", async () => {
    const t = await setupTenant("Purchase Pharmacy 3");
    const product = await createProduct(t.token);
    const supplier = await createSupplier(t.token);
    const expiryDate = new Date(Date.now() + 365 * 86_400_000).toISOString();

    const item = { productId: product.id, batchNumber: "REPEAT-01", expiryDate, quantity: 20, purchaseRate: 30, mrp: 50, gstRatePercent: 0 };

    const first = await request(app).post("/api/purchases").set("Authorization", `Bearer ${t.token}`).send({ branchId: t.branchId, supplierId: supplier.id, items: [item] });
    const second = await request(app).post("/api/purchases").set("Authorization", `Bearer ${t.token}`).send({ branchId: t.branchId, supplierId: supplier.id, items: [item] });

    const firstBatchId = first.body.data.items[0].batch.id;
    const secondBatchId = second.body.data.items[0].batch.id;
    expect(secondBatchId).toBe(firstBatchId);

    const batch = await prisma.batch.findUnique({ where: { id: firstBatchId } });
    expect(batch?.quantity).toBe(40);
  });

  it("records supplier payments and rejects overpayment beyond the outstanding balance", async () => {
    const t = await setupTenant("Purchase Pharmacy 4");
    const product = await createProduct(t.token);
    const supplier = await createSupplier(t.token);

    const purchase = await request(app)
      .post("/api/purchases")
      .set("Authorization", `Bearer ${t.token}`)
      .send({
        branchId: t.branchId,
        supplierId: supplier.id,
        items: [{ productId: product.id, batchNumber: "PAY-01", expiryDate: new Date(Date.now() + 300 * 86_400_000).toISOString(), quantity: 10, purchaseRate: 100, mrp: 150, gstRatePercent: 0 }],
      });
    const purchaseId = purchase.body.data.id;
    expect(Number(purchase.body.data.totalAmount)).toBeCloseTo(1000);

    const partial = await request(app)
      .post(`/api/purchases/${purchaseId}/payments`)
      .set("Authorization", `Bearer ${t.token}`)
      .send({ amount: 400, paymentMode: "BANK_TRANSFER" });
    expect(partial.status).toBe(201);
    expect(partial.body.data.paymentStatus).toBe("PARTIAL");

    const overpay = await request(app)
      .post(`/api/purchases/${purchaseId}/payments`)
      .set("Authorization", `Bearer ${t.token}`)
      .send({ amount: 10000, paymentMode: "CASH" });
    expect(overpay.status).toBe(422);

    const full = await request(app)
      .post(`/api/purchases/${purchaseId}/payments`)
      .set("Authorization", `Bearer ${t.token}`)
      .send({ amount: 600, paymentMode: "CASH" });
    expect(full.body.data.paymentStatus).toBe("PAID");
  });

  it("purchase return reduces stock and rejects returning more than is available", async () => {
    const t = await setupTenant("Purchase Pharmacy 5");
    const product = await createProduct(t.token);
    const supplier = await createSupplier(t.token);

    const purchase = await request(app)
      .post("/api/purchases")
      .set("Authorization", `Bearer ${t.token}`)
      .send({
        branchId: t.branchId,
        supplierId: supplier.id,
        items: [{ productId: product.id, batchNumber: "RET-01", expiryDate: new Date(Date.now() + 300 * 86_400_000).toISOString(), quantity: 20, purchaseRate: 30, mrp: 50, gstRatePercent: 0 }],
      });
    const batchId = purchase.body.data.items[0].batch.id;

    const tooMany = await request(app)
      .post("/api/purchase-returns")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, supplierId: supplier.id, purchaseId: purchase.body.data.id, items: [{ productId: product.id, batchId, quantity: 999, rate: 30 }] });
    expect(tooMany.status).toBe(422);

    const ok = await request(app)
      .post("/api/purchase-returns")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, supplierId: supplier.id, purchaseId: purchase.body.data.id, items: [{ productId: product.id, batchId, quantity: 5, rate: 30 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.data.referenceNumber).toMatch(/^PRET\/\d{4}-\d{2}\/\d{6}$/);

    const batch = await prisma.batch.findUnique({ where: { id: batchId } });
    expect(batch?.quantity).toBe(15);
  });
});
