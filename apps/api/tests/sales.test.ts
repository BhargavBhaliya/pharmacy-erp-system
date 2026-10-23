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

async function createProduct(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ sku: `SKU-${Math.random().toString(36).slice(2, 8)}`, name: "Ibuprofen 400mg", mrp: 30, purchasePrice: 15, sellingPrice: 20, ...overrides });
  return res.body.data;
}

async function createBatch(token: string, branchId: string, productId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/batches")
    .set("Authorization", `Bearer ${token}`)
    .send({
      branchId,
      productId,
      batchNumber: `B-${Math.random().toString(36).slice(2, 8)}`,
      expiryDate: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      purchaseRate: 15,
      mrp: 30,
      quantity: 10,
      ...overrides,
    });
  return res.body.data;
}

async function createRoleUser(t: { token: string; branchId: string }, roleName: string) {
  const roles = await request(app).get("/api/roles").set("Authorization", `Bearer ${t.token}`);
  const role = roles.body.data.find((r: { name: string }) => r.name === roleName);
  const email = uniqueEmail(roleName.toLowerCase().replace(/[^a-z]/g, ""));
  await request(app)
    .post("/api/users")
    .set("Authorization", `Bearer ${t.token}`)
    .send({ name: roleName, email, password: "Password123!", roleId: role.id, branchIds: [t.branchId] });
  const login = await request(app).post("/api/auth/login").send({ email, password: "Password123!" });
  return login.body.accessToken as string;
}

const createCashierUser = (t: { token: string; branchId: string }) => createRoleUser(t, "Billing/Cashier");
const createPharmacistUser = (t: { token: string; branchId: string }) => createRoleUser(t, "Pharmacist");

describe("POS / sales", () => {
  it("allocates across multiple FEFO batches for one line item and reduces stock on each", async () => {
    const t = await setupTenant("Sales Pharmacy 1");
    const product = await createProduct(t.token);
    const soon = await createBatch(t.token, t.branchId, product.id, { quantity: 6, expiryDate: new Date(Date.now() + 5 * 86_400_000).toISOString() });
    const later = await createBatch(t.token, t.branchId, product.id, { quantity: 10, expiryDate: new Date(Date.now() + 300 * 86_400_000).toISOString() });

    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({
        branchId: t.branchId,
        items: [{ productId: product.id, quantity: 9 }],
        payments: [{ amount: 9 * 20, paymentMode: "CASH" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(2); // split across both batches
    expect(res.body.data.invoiceNumber).toMatch(/^INV\/\d{4}-\d{2}\/\d{6}$/);
    expect(res.body.data.paymentStatus).toBe("PAID");

    const soonBatch = await prisma.batch.findUnique({ where: { id: soon.id } });
    const laterBatch = await prisma.batch.findUnique({ where: { id: later.id } });
    expect(soonBatch?.quantity).toBe(0); // fully consumed first (FEFO)
    expect(laterBatch?.quantity).toBe(7); // remaining 3 taken from here
  });

  it("rejects a sale that exceeds available non-expired stock", async () => {
    const t = await setupTenant("Sales Pharmacy 2");
    const product = await createProduct(t.token);
    await createBatch(t.token, t.branchId, product.id, { quantity: 5 });

    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, items: [{ productId: product.id, quantity: 50 }], payments: [{ amount: 1000, paymentMode: "CASH" }] });

    expect(res.status).toBe(422);
  });

  it("never sells an expired batch, even when it's the only stock on hand", async () => {
    const t = await setupTenant("Sales Pharmacy 3");
    const product = await createProduct(t.token);
    await createBatch(t.token, t.branchId, product.id, { quantity: 20, expiryDate: new Date(Date.now() - 86_400_000).toISOString() });

    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, items: [{ productId: product.id, quantity: 1 }], payments: [{ amount: 20, paymentMode: "CASH" }] });

    expect(res.status).toBe(422);
  });

  it("rejects underpaid non-credit sales but allows an unpaid credit sale within the customer's limit", async () => {
    const t = await setupTenant("Sales Pharmacy 4");
    const product = await createProduct(t.token);
    await createBatch(t.token, t.branchId, product.id, { quantity: 20 });

    const underpaid = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, items: [{ productId: product.id, quantity: 2 }], payments: [{ amount: 5, paymentMode: "CASH" }] });
    expect(underpaid.status).toBe(422);

    const customerRes = await request(app).post("/api/customers").set("Authorization", `Bearer ${t.token}`).send({ name: "Credit Customer", creditLimit: 1000 });
    const credit = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, customerId: customerRes.body.data.id, invoiceType: "CREDIT", items: [{ productId: product.id, quantity: 2 }], payments: [] });
    expect(credit.status).toBe(201);
    expect(credit.body.data.paymentStatus).toBe("UNPAID");
  });

  it("blocks a credit sale that would exceed the customer's credit limit", async () => {
    const t = await setupTenant("Sales Pharmacy 5");
    const product = await createProduct(t.token, { sellingPrice: 100 });
    await createBatch(t.token, t.branchId, product.id, { quantity: 50 });

    const customerRes = await request(app).post("/api/customers").set("Authorization", `Bearer ${t.token}`).send({ name: "Tight Limit Customer", creditLimit: 150 });

    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, customerId: customerRes.body.data.id, invoiceType: "CREDIT", items: [{ productId: product.id, quantity: 5 }], payments: [] });

    expect(res.status).toBe(422);
  });

  it("enforces the cashier's discount limit but allows the admin's higher limit", async () => {
    const t = await setupTenant("Sales Pharmacy 6");
    const product = await createProduct(t.token, { sellingPrice: 100 });
    await createBatch(t.token, t.branchId, product.id, { quantity: 20 });
    const cashierToken = await createCashierUser(t);

    const tooMuchDiscount = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ branchId: t.branchId, items: [{ productId: product.id, quantity: 1, discountPercent: 20 }], payments: [{ amount: 80, paymentMode: "CASH" }] });
    expect(tooMuchDiscount.status).toBe(403);

    const withinLimit = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ branchId: t.branchId, items: [{ productId: product.id, quantity: 1, discountPercent: 5 }], payments: [{ amount: 95, paymentMode: "CASH" }] });
    expect(withinLimit.status).toBe(201);
  });

  it("cancelling a sale reverses stock and keeps the record with a reason", async () => {
    const t = await setupTenant("Sales Pharmacy 7");
    const product = await createProduct(t.token);
    const batch = await createBatch(t.token, t.branchId, product.id, { quantity: 20 });

    const sale = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, items: [{ productId: product.id, quantity: 5 }], payments: [{ amount: 100, paymentMode: "CASH" }] });

    const afterSale = await prisma.batch.findUnique({ where: { id: batch.id } });
    expect(afterSale?.quantity).toBe(15);

    const cancelled = await request(app)
      .put(`/api/sales/${sale.body.data.id}/cancel`)
      .set("Authorization", `Bearer ${t.token}`)
      .send({ cancelReason: "Customer changed their mind" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");

    const afterCancel = await prisma.batch.findUnique({ where: { id: batch.id } });
    expect(afterCancel?.quantity).toBe(20);

    const stillExists = await prisma.sale.findUnique({ where: { id: sale.body.data.id } });
    expect(stillExists).not.toBeNull();
    expect(stillExists?.cancelReason).toBe("Customer changed their mind");
  });
});

describe("sales returns", () => {
  it("an admin's return is auto-approved and restores stock; over-returning is rejected", async () => {
    const t = await setupTenant("Sales Return Pharmacy 1");
    const product = await createProduct(t.token);
    const batch = await createBatch(t.token, t.branchId, product.id, { quantity: 20 });

    const sale = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, items: [{ productId: product.id, quantity: 10 }], payments: [{ amount: 200, paymentMode: "CASH" }] });
    const saleItemId = sale.body.data.items[0].id;

    const overReturn = await request(app)
      .post("/api/sales-returns")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ saleId: sale.body.data.id, items: [{ saleItemId, quantity: 999 }] });
    expect(overReturn.status).toBe(422);

    const ret = await request(app)
      .post("/api/sales-returns")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ saleId: sale.body.data.id, items: [{ saleItemId, quantity: 4 }], reason: "Wrong item" });
    expect(ret.status).toBe(201);
    expect(ret.body.data.status).toBe("APPROVED");
    expect(ret.body.data.referenceNumber).toMatch(/^SRET\/\d{4}-\d{2}\/\d{6}$/);

    const batchAfter = await prisma.batch.findUnique({ where: { id: batch.id } });
    expect(batchAfter?.quantity).toBe(14); // 20 - 10 sold + 4 returned

    // An approved return reduces the original sale's own totals (not just stock) — the
    // invoice should read as if the returned 4 units were never sold.
    const saleAfter = await prisma.sale.findUniqueOrThrow({ where: { id: sale.body.data.id } });
    expect(Number(saleAfter.totalAmount)).toBeCloseTo(200 - Number(ret.body.data.totalAmount), 2);
    expect(Number(saleAfter.paidAmount)).toBeCloseTo(200 - Number(ret.body.data.totalAmount), 2);
    expect(saleAfter.paymentStatus).toBe("PAID");
  });

  it("a pharmacist's return stays pending until a manager approves it (pharmacist can add but not approve)", async () => {
    const t = await setupTenant("Sales Return Pharmacy 2");
    const product = await createProduct(t.token);
    const batch = await createBatch(t.token, t.branchId, product.id, { quantity: 20 });
    const pharmacistToken = await createPharmacistUser(t);

    const sale = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${pharmacistToken}`)
      .send({ branchId: t.branchId, items: [{ productId: product.id, quantity: 6 }], payments: [{ amount: 120, paymentMode: "CASH" }] });
    const saleItemId = sale.body.data.items[0].id;

    const ret = await request(app)
      .post("/api/sales-returns")
      .set("Authorization", `Bearer ${pharmacistToken}`)
      .send({ saleId: sale.body.data.id, items: [{ saleItemId, quantity: 2 }] });
    expect(ret.status).toBe(201);
    expect(ret.body.data.status).toBe("PENDING");

    const batchWhilePending = await prisma.batch.findUnique({ where: { id: batch.id } });
    expect(batchWhilePending?.quantity).toBe(14); // not restored yet

    const saleWhilePending = await prisma.sale.findUniqueOrThrow({ where: { id: sale.body.data.id } });
    expect(Number(saleWhilePending.totalAmount)).toBeCloseTo(120, 2); // untouched until approved

    const approved = await request(app).put(`/api/sales-returns/${ret.body.data.id}/approve`).set("Authorization", `Bearer ${t.token}`);
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("APPROVED");

    const batchAfterApproval = await prisma.batch.findUnique({ where: { id: batch.id } });
    expect(batchAfterApproval?.quantity).toBe(16);

    const saleAfterApproval = await prisma.sale.findUniqueOrThrow({ where: { id: sale.body.data.id } });
    expect(Number(saleAfterApproval.totalAmount)).toBeCloseTo(120 - Number(ret.body.data.totalAmount), 2);
  });
});
