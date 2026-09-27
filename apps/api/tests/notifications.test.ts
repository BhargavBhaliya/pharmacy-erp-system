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

// notify() is fire-and-forget, so give its async DB write a moment to land before asserting.
const flush = () => new Promise((r) => setTimeout(r, 100));

describe("notifications", () => {
  it("creates a notification when a new user is added, and supports mark-as-read", async () => {
    const t = await setupTenant("Notify Pharmacy 1");
    const roles = await request(app).get("/api/roles").set("Authorization", `Bearer ${t.token}`);
    const cashierRole = roles.body.data.find((r: { name: string }) => r.name === "Billing/Cashier");

    await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ name: "New Cashier", email: uniqueEmail("nc"), password: "Password123!", roleId: cashierRole.id, branchIds: [t.branchId] });
    await flush();

    const list = await request(app).get("/api/notifications").set("Authorization", `Bearer ${t.token}`);
    expect(list.status).toBe(200);
    expect(list.body.unreadCount).toBeGreaterThanOrEqual(1);
    const userNotif = list.body.data.find((n: { type: string }) => n.type === "user_created");
    expect(userNotif).toBeTruthy();
    expect(userNotif.isRead).toBe(false);

    const markRead = await request(app).put(`/api/notifications/${userNotif.id}/read`).set("Authorization", `Bearer ${t.token}`);
    expect(markRead.body.data.isRead).toBe(true);
  });

  it("notifies when a sales return needs approval but not when it auto-approves", async () => {
    const t = await setupTenant("Notify Pharmacy 2");
    const product = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ sku: `SKU-${Math.random().toString(36).slice(2, 8)}`, name: "Test Med", mrp: 20, purchasePrice: 10, sellingPrice: 15 });
    await request(app)
      .post("/api/batches")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, productId: product.body.data.id, batchNumber: "N-1", expiryDate: new Date(Date.now() + 300 * 86_400_000).toISOString(), purchaseRate: 10, mrp: 20, quantity: 20 });

    const roles = await request(app).get("/api/roles").set("Authorization", `Bearer ${t.token}`);
    const pharmacistRole = roles.body.data.find((r: { name: string }) => r.name === "Pharmacist");
    const pharmacistEmail = uniqueEmail("ph");
    await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ name: "Pharmacist", email: pharmacistEmail, password: "Password123!", roleId: pharmacistRole.id, branchIds: [t.branchId] });
    const pharmacistLogin = await request(app).post("/api/auth/login").send({ email: pharmacistEmail, password: "Password123!" });
    const pharmacistToken = pharmacistLogin.body.accessToken;

    const sale = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${pharmacistToken}`)
      .send({ branchId: t.branchId, items: [{ productId: product.body.data.id, quantity: 5 }], payments: [{ amount: 75, paymentMode: "CASH" }] });

    await request(app)
      .post("/api/sales-returns")
      .set("Authorization", `Bearer ${pharmacistToken}`)
      .send({ saleId: sale.body.data.id, items: [{ saleItemId: sale.body.data.items[0].id, quantity: 1 }] });
    await flush();

    const list = await request(app).get("/api/notifications").set("Authorization", `Bearer ${t.token}`);
    const pending = list.body.data.find((n: { type: string }) => n.type === "sales_return_pending");
    expect(pending).toBeTruthy();
  });
});
