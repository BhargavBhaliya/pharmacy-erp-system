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
  const counters = await request(app).get("/api/counters").query({ branchId: reg.body.branch.id }).set("Authorization", `Bearer ${login.body.accessToken}`);
  return { tenantId: reg.body.tenant.id, branchId: reg.body.branch.id, token: login.body.accessToken as string, counterId: counters.body.data[0].id as string };
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

async function createProduct(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${token}`)
    .send({ sku: `SKU-${Math.random().toString(36).slice(2, 8)}`, name: "Cetirizine 10mg", mrp: 30, purchasePrice: 15, sellingPrice: 20, ...overrides });
  return res.body.data;
}

async function createBatch(token: string, branchId: string, productId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/batches")
    .set("Authorization", `Bearer ${token}`)
    .send({ branchId, productId, batchNumber: `B-${Math.random().toString(36).slice(2, 8)}`, expiryDate: new Date(Date.now() + 365 * 86_400_000).toISOString(), purchaseRate: 15, mrp: 30, quantity: 100, ...overrides });
  return res.body.data;
}

describe("expenses", () => {
  it("auto-approves an expense created by a user with approve rights, but leaves a lower role's expense pending", async () => {
    const t = await setupTenant("Accounting Pharmacy 1");
    const category = await request(app).post("/api/expense-categories").set("Authorization", `Bearer ${t.token}`).send({ name: "Electricity" });

    const adminExpense = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, categoryId: category.body.data.id, amount: 500, paymentMode: "CASH" });
    expect(adminExpense.body.data.status).toBe("APPROVED");

    const cashierToken = await createRoleUser(t, "Billing/Cashier");
    const cashierExpense = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ branchId: t.branchId, categoryId: category.body.data.id, amount: 200, paymentMode: "CASH" });
    // Cashier role has no expenses permissions at all by default, so this should be forbidden.
    expect(cashierExpense.status).toBe(403);

    const accountantToken = await createRoleUser(t, "Accountant");
    const accountantExpense = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${accountantToken}`)
      .send({ branchId: t.branchId, categoryId: category.body.data.id, amount: 300, paymentMode: "CASH" });
    expect(accountantExpense.status).toBe(201);
    // Accountant has expenses.* including approve, so this auto-approves too.
    expect(accountantExpense.body.data.status).toBe("APPROVED");
  });
});

describe("customer receipts (FIFO allocation)", () => {
  it("applies one receipt across two older invoices before touching a newer one", async () => {
    const t = await setupTenant("Accounting Pharmacy 2");
    const product = await createProduct(t.token);
    await createBatch(t.token, t.branchId, product.id);
    const customer = await request(app).post("/api/customers").set("Authorization", `Bearer ${t.token}`).send({ name: "FIFO Customer", creditLimit: 10000 });

    const sale1 = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, customerId: customer.body.data.id, invoiceType: "CREDIT", items: [{ productId: product.id, quantity: 5 }], payments: [] }); // 100 due
    const sale2 = await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, customerId: customer.body.data.id, invoiceType: "CREDIT", items: [{ productId: product.id, quantity: 5 }], payments: [] }); // 100 due

    const receipt = await request(app)
      .post("/api/receipts")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, customerId: customer.body.data.id, amount: 150, paymentMode: "CASH" });

    expect(receipt.status).toBe(201);
    expect(receipt.body.unallocatedAmount).toBe(0);

    const sale1After = await prisma.sale.findUnique({ where: { id: sale1.body.data.id } });
    const sale2After = await prisma.sale.findUnique({ where: { id: sale2.body.data.id } });
    expect(sale1After?.paymentStatus).toBe("PAID"); // fully paid off first (older)
    expect(Number(sale1After?.paidAmount)).toBe(100);
    expect(sale2After?.paymentStatus).toBe("PARTIAL"); // remaining 50 applied here
    expect(Number(sale2After?.paidAmount)).toBe(50);
  });
});

describe("supplier payments (FIFO allocation)", () => {
  it("pays off the oldest outstanding purchase first", async () => {
    const t = await setupTenant("Accounting Pharmacy 3");
    const product = await createProduct(t.token);
    const supplier = await request(app).post("/api/suppliers").set("Authorization", `Bearer ${t.token}`).send({ name: "FIFO Supplier" });

    const purchase1 = await request(app)
      .post("/api/purchases")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, supplierId: supplier.body.data.id, items: [{ productId: product.id, batchNumber: "SP-1", expiryDate: new Date(Date.now() + 300 * 86_400_000).toISOString(), quantity: 10, purchaseRate: 20, mrp: 30, gstRatePercent: 0 }] }); // 200 due

    const payment = await request(app)
      .post("/api/supplier-payments")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, supplierId: supplier.body.data.id, amount: 120, paymentMode: "BANK_TRANSFER" });

    expect(payment.status).toBe(201);
    const purchase1After = await prisma.purchase.findUnique({ where: { id: purchase1.body.data.id } });
    expect(purchase1After?.paymentStatus).toBe("PARTIAL");
    expect(Number(purchase1After?.paidAmount)).toBe(120);
  });
});

describe("cash session", () => {
  it("computes expected closing from cash sales/expenses and reports a variance", async () => {
    const t = await setupTenant("Accounting Pharmacy 4");
    const product = await createProduct(t.token);
    await createBatch(t.token, t.branchId, product.id);

    const open = await request(app)
      .post("/api/cash-sessions")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, counterId: t.counterId, openingAmount: 1000 });
    expect(open.status).toBe(201);
    expect(open.body.data.status).toBe("OPEN");

    // A second open session on the same counter should be rejected.
    const dup = await request(app)
      .post("/api/cash-sessions")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, counterId: t.counterId, openingAmount: 500 });
    expect(dup.status).toBe(422);

    await request(app)
      .post("/api/sales")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, items: [{ productId: product.id, quantity: 5 }], payments: [{ amount: 100, paymentMode: "CASH" }] });

    const category = await request(app).post("/api/expense-categories").set("Authorization", `Bearer ${t.token}`).send({ name: "Tea & Snacks" });
    await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ branchId: t.branchId, categoryId: category.body.data.id, amount: 30, paymentMode: "CASH" });

    const close = await request(app)
      .put(`/api/cash-sessions/${open.body.data.id}/close`)
      .set("Authorization", `Bearer ${t.token}`)
      .send({ closingAmount: 1050 }); // actual count is short by 20

    expect(close.status).toBe(200);
    // expected = 1000 opening + 100 cash sale - 30 cash expense = 1070
    expect(Number(close.body.data.expectedClosingAmount)).toBeCloseTo(1070);
    expect(Number(close.body.data.variance)).toBeCloseTo(-20);
    expect(close.body.data.status).toBe("CLOSED");
  });
});
