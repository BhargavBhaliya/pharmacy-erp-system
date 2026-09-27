import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { findAvailableBatchesFefo, adjustStock } from "../src/lib/inventory";
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

async function createProduct(token: string, overrides: Partial<Record<string, unknown>> = {}) {
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
      name: "Paracetamol 500mg",
      mrp: 20,
      purchasePrice: 10,
      sellingPrice: 15,
      reorderLevel: 5,
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function createBatch(token: string, branchId: string, productId: string, overrides: Partial<Record<string, unknown>> = {}) {
  const res = await request(app)
    .post("/api/batches")
    .set("Authorization", `Bearer ${token}`)
    .send({
      branchId,
      productId,
      batchNumber: `B-${Math.random().toString(36).slice(2, 8)}`,
      expiryDate: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      purchaseRate: 10,
      mrp: 20,
      quantity: 10,
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe("inventory: batches, FEFO, adjustments", () => {
  it("creates a batch and records an OPENING stock transaction", async () => {
    const t = await setupTenant("Inventory Pharmacy 1");
    const product = await createProduct(t.token);
    const batch = await createBatch(t.token, t.branchId, product.id, { quantity: 25 });

    expect(batch.quantity).toBe(25);

    const txns = await request(app)
      .get(`/api/inventory/transactions?batchId=${batch.id}`)
      .set("Authorization", `Bearer ${t.token}`);
    expect(txns.body.data).toHaveLength(1);
    expect(txns.body.data[0].type).toBe("OPENING");
    expect(txns.body.data[0].quantity).toBe(25);
  });

  it("FEFO orders batches soonest-expiry-first and excludes expired/blocked batches", async () => {
    const t = await setupTenant("Inventory Pharmacy 2");
    const product = await createProduct(t.token);

    const soon = await createBatch(t.token, t.branchId, product.id, {
      expiryDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    });
    const later = await createBatch(t.token, t.branchId, product.id, {
      expiryDate: new Date(Date.now() + 400 * 86_400_000).toISOString(),
    });
    await createBatch(t.token, t.branchId, product.id, {
      expiryDate: new Date(Date.now() - 5 * 86_400_000).toISOString(), // already expired
    });

    const available = await findAvailableBatchesFefo(prisma, {
      tenantId: t.tenantId,
      branchId: t.branchId,
      productId: product.id,
    });

    expect(available.map((b) => b.id)).toEqual([soon.id, later.id]);
  });

  it("refuses to sell an expired batch even if quantity is available", async () => {
    const t = await setupTenant("Inventory Pharmacy 3");
    const product = await createProduct(t.token);
    const expired = await createBatch(t.token, t.branchId, product.id, {
      expiryDate: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    });

    await expect(
      prisma.$transaction((tx) =>
        adjustStock(tx, {
          tenantId: t.tenantId,
          branchId: t.branchId,
          batchId: expired.id,
          productId: product.id,
          quantityDelta: -1,
          type: "SALE",
        })
      )
    ).rejects.toThrow(/expired/i);
  });

  it("stock adjustment updates batch quantity and rejects over-deduction", async () => {
    const t = await setupTenant("Inventory Pharmacy 4");
    const product = await createProduct(t.token);
    const batch = await createBatch(t.token, t.branchId, product.id, { quantity: 10 });

    const ok = await request(app)
      .post("/api/inventory/adjust")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, batchId: batch.id, quantityDelta: -4, reason: "DAMAGED", notes: "dropped box" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.batch.quantity).toBe(6);

    const tooMuch = await request(app)
      .post("/api/inventory/adjust")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, batchId: batch.id, quantityDelta: -100, reason: "LOST" });
    expect(tooMuch.status).toBe(422);
  });

  it("flags low stock once available quantity drops to or below reorder level", async () => {
    const t = await setupTenant("Inventory Pharmacy 5");
    const product = await createProduct(t.token, { reorderLevel: 5 });
    const batch = await createBatch(t.token, t.branchId, product.id, { quantity: 5 });

    const lowStock = await request(app).get("/api/inventory/low-stock").set("Authorization", `Bearer ${t.token}`);
    expect(lowStock.body.data.some((r: { productId: string }) => r.productId === product.id)).toBe(true);

    await request(app)
      .post("/api/inventory/adjust")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, batchId: batch.id, quantityDelta: 20, reason: "FOUND" });

    const restocked = await request(app).get("/api/inventory/low-stock").set("Authorization", `Bearer ${t.token}`);
    expect(restocked.body.data.some((r: { productId: string }) => r.productId === product.id)).toBe(false);
  });

  it("expiry endpoint reports already-expired and near-expiry batches separately", async () => {
    const t = await setupTenant("Inventory Pharmacy 6");
    const product = await createProduct(t.token);
    await createBatch(t.token, t.branchId, product.id, { expiryDate: new Date(Date.now() - 86_400_000).toISOString() });
    await createBatch(t.token, t.branchId, product.id, { expiryDate: new Date(Date.now() + 10 * 86_400_000).toISOString() });

    const res = await request(app).get("/api/inventory/expiry?windowDays=30").set("Authorization", `Bearer ${t.token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.expiredCount).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.nearExpiryCount).toBeGreaterThanOrEqual(1);
  });

  it("blocks access to a batch/adjustment in a branch the user isn't assigned to", async () => {
    const t = await setupTenant("Inventory Pharmacy 7");
    const other = await setupTenant("Inventory Pharmacy 8");
    const product = await createProduct(t.token);
    const batch = await createBatch(t.token, t.branchId, product.id, { quantity: 10 });

    // `other` tenant's owner has no assignment to `t`'s branch.
    const res = await request(app)
      .post("/api/inventory/adjust")
      .set("Authorization", `Bearer ${other.token}`)
      .send({ branchId: t.branchId, batchId: batch.id, quantityDelta: -1, reason: "OTHER" });
    expect(res.status).toBe(403);
  });
});

describe("stock transfer workflow", () => {
  it("moves stock from source to destination branch through request -> approve -> dispatch -> receive", async () => {
    const t = await setupTenant("Transfer Pharmacy 1");

    const branch2Res = await request(app)
      .post("/api/branches")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ name: "Second Branch" });
    const branch2Id = branch2Res.body.data.id;

    const product = await createProduct(t.token);
    const batch = await createBatch(t.token, t.branchId, product.id, { quantity: 20 });

    const createRes = await request(app)
      .post("/api/stock-transfers")
      .set("Authorization", `Bearer ${t.token}`)
      .send({
        fromBranchId: t.branchId,
        toBranchId: branch2Id,
        items: [{ productId: product.id, batchId: batch.id, quantity: 8 }],
      });
    expect(createRes.status).toBe(201);
    const transferId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe("REQUESTED");

    const approveRes = await request(app)
      .put(`/api/stock-transfers/${transferId}/approve`)
      .set("Authorization", `Bearer ${t.token}`);
    expect(approveRes.body.data.status).toBe("APPROVED");

    const dispatchRes = await request(app)
      .put(`/api/stock-transfers/${transferId}/dispatch`)
      .set("Authorization", `Bearer ${t.token}`);
    expect(dispatchRes.body.data.status).toBe("DISPATCHED");

    const sourceBatchAfterDispatch = await prisma.batch.findUnique({ where: { id: batch.id } });
    expect(sourceBatchAfterDispatch?.quantity).toBe(12); // 20 - 8

    const receiveRes = await request(app)
      .put(`/api/stock-transfers/${transferId}/receive`)
      .set("Authorization", `Bearer ${t.token}`);
    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.data.status).toBe("RECEIVED");

    const destStock = await request(app)
      .get(`/api/inventory/stock?branchId=${branch2Id}&productId=${product.id}`)
      .set("Authorization", `Bearer ${t.token}`);
    expect(destStock.body.data[0].availableQuantity).toBe(8);
  });

  it("rejects dispatching more than is available and rejects transfers between the same branch", async () => {
    const t = await setupTenant("Transfer Pharmacy 2");
    const product = await createProduct(t.token);
    const batch = await createBatch(t.token, t.branchId, product.id, { quantity: 3 });

    const sameBranch = await request(app)
      .post("/api/stock-transfers")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ fromBranchId: t.branchId, toBranchId: t.branchId, items: [{ productId: product.id, batchId: batch.id, quantity: 1 }] });
    expect(sameBranch.status).toBe(422);

    const branch2Res = await request(app)
      .post("/api/branches")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ name: "Overflow Branch" });

    const tooMany = await request(app)
      .post("/api/stock-transfers")
      .set("Authorization", `Bearer ${t.token}`)
      .send({
        fromBranchId: t.branchId,
        toBranchId: branch2Res.body.data.id,
        items: [{ productId: product.id, batchId: batch.id, quantity: 999 }],
      });
    expect(tooMany.status).toBe(422);
  });
});
