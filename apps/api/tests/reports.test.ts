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
  const reg = await request(app).post("/api/auth/register-business").send({ businessName, ownerName: "Owner", email, password: "Password123!" });
  createdTenantIds.push(reg.body.tenant.id);
  const login = await request(app).post("/api/auth/login").send({ email, password: "Password123!" });
  return { tenantId: reg.body.tenant.id, branchId: reg.body.branch.id, token: login.body.accessToken as string };
}

async function createProduct(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ sku: `SKU-${Math.random().toString(36).slice(2, 8)}`, name: "Vitamin C 500mg", mrp: 40, purchasePrice: 20, sellingPrice: 30, ...overrides });
  return res.body.data;
}

async function createBatch(token: string, branchId: string, productId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/batches")
    .set("Authorization", `Bearer ${token}`)
    .send({ branchId, productId, batchNumber: `B-${Math.random().toString(36).slice(2, 8)}`, expiryDate: new Date(Date.now() + 365 * 86_400_000).toISOString(), purchaseRate: 20, mrp: 40, quantity: 100, ...overrides });
  return res.body.data;
}

describe("reports", () => {
  it("groups the sales report by product with correct totals, and can export as CSV", async () => {
    const t = await setupTenant("Reports Pharmacy 1");
    const productA = await createProduct(t.token, { name: "Product A", sellingPrice: 30 });
    const productB = await createProduct(t.token, { name: "Product B", sellingPrice: 50 });
    await createBatch(t.token, t.branchId, productA.id);
    await createBatch(t.token, t.branchId, productB.id);

    await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, items: [{ productId: productA.id, quantity: 2 }], payments: [{ amount: 60, paymentMode: "CASH" }] });
    await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, items: [{ productId: productB.id, quantity: 1 }], payments: [{ amount: 50, paymentMode: "CASH" }] });

    const json = await request(app).get("/api/reports/sales").query({ groupBy: "product" }).set("Authorization", `Bearer ${t.token}`);
    expect(json.status).toBe(200);
    const rowA = json.body.data.find((r: { label: string }) => r.label === "Product A");
    const rowB = json.body.data.find((r: { label: string }) => r.label === "Product B");
    expect(rowA.totalAmount).toBe(60);
    expect(rowA.quantity).toBe(2);
    expect(rowB.totalAmount).toBe(50);

    const csv = await request(app).get("/api/reports/sales").query({ groupBy: "product", format: "csv" }).set("Authorization", `Bearer ${t.token}`);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain("Product A");
  });

  it("computes stock valuation at cost and MRP from current available batches", async () => {
    const t = await setupTenant("Reports Pharmacy 2");
    const product = await createProduct(t.token);
    await createBatch(t.token, t.branchId, product.id, { quantity: 50, purchaseRate: 20, mrp: 40 });

    const res = await request(app).get("/api/reports/inventory/stock-valuation").set("Authorization", `Bearer ${t.token}`);
    expect(res.status).toBe(200);
    const row = res.body.data.find((r: { key: string }) => r.key === product.id);
    expect(row.quantity).toBe(50);
    expect(row.stockValueAtCost).toBe(1000); // 50 * 20
    expect(row.stockValueAtMrp).toBe(2000); // 50 * 40
  });

  it("classifies products as fast/slow/non-moving based on units sold vs current stock", async () => {
    const t = await setupTenant("Reports Pharmacy 3");
    const fastMover = await createProduct(t.token, { name: "Fast Mover" });
    const slowMover = await createProduct(t.token, { name: "Slow Mover" });
    const nonMover = await createProduct(t.token, { name: "Non Mover" });
    await createBatch(t.token, t.branchId, fastMover.id, { quantity: 200 });
    await createBatch(t.token, t.branchId, slowMover.id, { quantity: 200 });
    await createBatch(t.token, t.branchId, nonMover.id, { quantity: 200 });

    await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, items: [{ productId: fastMover.id, quantity: 25 }], payments: [{ amount: 750, paymentMode: "CASH" }] });
    await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, items: [{ productId: slowMover.id, quantity: 3 }], payments: [{ amount: 90, paymentMode: "CASH" }] });

    const res = await request(app).get("/api/reports/inventory/movement").set("Authorization", `Bearer ${t.token}`);
    const byId = new Map(res.body.data.map((r: { key: string; classification: string }) => [r.key, r.classification]));
    expect(byId.get(fastMover.id)).toBe("FAST_MOVING");
    expect(byId.get(slowMover.id)).toBe("SLOW_MOVING");
    expect(byId.get(nonMover.id)).toBe("NON_MOVING");
  });
});
