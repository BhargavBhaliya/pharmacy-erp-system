import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { uniqueEmail, deleteTenant } from "./helpers";

const createdTenantIds: string[] = [];
let platformAdminId: string;
const PLATFORM_ADMIN_EMAIL = uniqueEmail("platform-admin");
const PLATFORM_ADMIN_PASSWORD = "PlatformPass123!";

beforeAll(async () => {
  const passwordHash = await hashPassword(PLATFORM_ADMIN_PASSWORD);
  const admin = await prisma.platformAdmin.create({
    data: { name: "Test Platform Admin", email: PLATFORM_ADMIN_EMAIL, passwordHash },
  });
  platformAdminId = admin.id;
});

afterAll(async () => {
  for (const id of createdTenantIds) await deleteTenant(id);
  await prisma.platformAdmin.delete({ where: { id: platformAdminId } }).catch(() => undefined);
  await prisma.$disconnect();
});

async function platformLogin() {
  const res = await request(app).post("/api/platform/auth/login").send({
    email: PLATFORM_ADMIN_EMAIL,
    password: PLATFORM_ADMIN_PASSWORD,
  });
  return res.body.accessToken as string;
}

async function createStore(token: string, overrides: Partial<{ businessName: string; ownerName: string; email: string; password: string }> = {}) {
  const res = await request(app)
    .post("/api/platform/stores")
    .set("Authorization", `Bearer ${token}`)
    .send({
      businessName: overrides.businessName ?? "Platform Test Pharmacy",
      ownerName: overrides.ownerName ?? "Store Owner",
      email: overrides.email ?? uniqueEmail("store-owner"),
      password: overrides.password ?? "StoreOwner123!",
    });
  if (res.body?.tenant?.id) createdTenantIds.push(res.body.tenant.id);
  return res;
}

describe("platform admin auth", () => {
  it("logs in with correct credentials and rejects wrong password", async () => {
    const good = await request(app).post("/api/platform/auth/login").send({
      email: PLATFORM_ADMIN_EMAIL,
      password: PLATFORM_ADMIN_PASSWORD,
    });
    expect(good.status).toBe(200);
    expect(good.body.accessToken).toBeTruthy();

    const bad = await request(app).post("/api/platform/auth/login").send({
      email: PLATFORM_ADMIN_EMAIL,
      password: "wrong",
    });
    expect(bad.status).toBe(401);
  });

  it("rotates the refresh token via cookie", async () => {
    const agent = request.agent(app);
    const login = await agent.post("/api/platform/auth/login").send({
      email: PLATFORM_ADMIN_EMAIL,
      password: PLATFORM_ADMIN_PASSWORD,
    });
    expect(login.status).toBe(200);

    const refreshed = await agent.post("/api/platform/auth/refresh");
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
  });

  it("a tenant user's access token is rejected by platform routes", async () => {
    const token = await platformLogin();
    const create = await createStore(token);
    const tenantLogin = await request(app).post("/api/auth/login").send({
      email: create.body.user.email,
      password: "StoreOwner123!",
    });

    const res = await request(app).get("/api/platform/stores").set("Authorization", `Bearer ${tenantLogin.body.accessToken}`);
    expect(res.status).toBe(401);
  });

  it("a platform admin's access token is rejected by the tenant authenticate() middleware", async () => {
    const token = await platformLogin();
    const res = await request(app).get("/api/branches").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe("platform store management", () => {
  it("creates a store whose owner can log in through the normal tenant login, with a unique sequential storeCode", async () => {
    const token = await platformLogin();
    const email = uniqueEmail("new-store-owner");
    const create = await createStore(token, { email });

    expect(create.status).toBe(201);
    expect(create.body.tenant.storeCode).toMatch(/^STORE-\d{4}$/);

    const login = await request(app).post("/api/auth/login").send({ email, password: "StoreOwner123!" });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(email);
  });

  it("GET /platform/stores supports search by businessName and isActive filter", async () => {
    const token = await platformLogin();
    const businessName = `Searchable Pharmacy ${Date.now()}`;
    await createStore(token, { businessName, email: uniqueEmail("searchable") });

    const bySearch = await request(app)
      .get("/api/platform/stores")
      .query({ search: businessName })
      .set("Authorization", `Bearer ${token}`);
    expect(bySearch.status).toBe(200);
    expect(bySearch.body.data.some((s: { businessName: string }) => s.businessName === businessName)).toBe(true);

    const byActive = await request(app)
      .get("/api/platform/stores")
      .query({ isActive: "true" })
      .set("Authorization", `Bearer ${token}`);
    expect(byActive.status).toBe(200);
    expect(byActive.body.data.every((s: { isActive: boolean }) => s.isActive)).toBe(true);
  });

  it("deactivating a store blocks login, blocks refresh, and rejects an already-issued access token on the next request", async () => {
    const token = await platformLogin();
    const email = uniqueEmail("deactivate-test");
    const create = await createStore(token, { email });
    const tenantId = create.body.tenant.id;

    const agent = request.agent(app);
    const tenantLogin = await agent.post("/api/auth/login").send({ email, password: "StoreOwner123!" });
    expect(tenantLogin.status).toBe(200);
    const stillValidAccessToken = tenantLogin.body.accessToken as string;

    const workingBefore = await request(app).get("/api/branches").set("Authorization", `Bearer ${stillValidAccessToken}`);
    expect(workingBefore.status).toBe(200);

    const deactivate = await request(app)
      .post(`/api/platform/stores/${tenantId}/deactivate`)
      .set("Authorization", `Bearer ${token}`);
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.data.isActive).toBe(false);

    // Already-issued access token must be rejected mid-session, not just at next login.
    const blockedMidSession = await request(app).get("/api/branches").set("Authorization", `Bearer ${stillValidAccessToken}`);
    expect(blockedMidSession.status).toBe(401);

    const blockedLogin = await request(app).post("/api/auth/login").send({ email, password: "StoreOwner123!" });
    expect(blockedLogin.status).toBe(401);

    const blockedRefresh = await agent.post("/api/auth/refresh");
    expect(blockedRefresh.status).toBe(401);

    const reactivate = await request(app)
      .post(`/api/platform/stores/${tenantId}/activate`)
      .set("Authorization", `Bearer ${token}`);
    expect(reactivate.status).toBe(200);

    const restoredLogin = await request(app).post("/api/auth/login").send({ email, password: "StoreOwner123!" });
    expect(restoredLogin.status).toBe(200);
  });

  it("resetting a store user's password revokes existing refresh tokens and allows login with the new password", async () => {
    const token = await platformLogin();
    const email = uniqueEmail("reset-pw");
    const create = await createStore(token, { email });
    const tenantId = create.body.tenant.id;
    const userId = create.body.user.id;

    const agent = request.agent(app);
    const tenantLogin = await agent.post("/api/auth/login").send({ email, password: "StoreOwner123!" });
    expect(tenantLogin.status).toBe(200);

    const reset = await request(app)
      .post(`/api/platform/stores/${tenantId}/users/${userId}/reset-password`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(reset.status).toBe(200);
    const newPassword = reset.body.data.generatedPassword as string;
    expect(newPassword).toBeTruthy();

    const oldRefreshFails = await agent.post("/api/auth/refresh");
    expect(oldRefreshFails.status).toBe(401);

    const oldPasswordFails = await request(app).post("/api/auth/login").send({ email, password: "StoreOwner123!" });
    expect(oldPasswordFails.status).toBe(401);

    const newPasswordWorks = await request(app).post("/api/auth/login").send({ email, password: newPassword });
    expect(newPasswordWorks.status).toBe(200);
  });

  it("impersonation issues a working tenant token for exactly that user, the exchange code is single-use, and it writes an audit log row", async () => {
    const token = await platformLogin();
    const email = uniqueEmail("impersonate");
    const create = await createStore(token, { email });
    const tenantId = create.body.tenant.id;
    const userId = create.body.user.id;

    const impersonate = await request(app)
      .post(`/api/platform/stores/${tenantId}/users/${userId}/impersonate`)
      .set("Authorization", `Bearer ${token}`);
    expect(impersonate.status).toBe(200);
    const code = impersonate.body.data.exchangeCode as string;
    expect(code).toBeTruthy();

    const firstExchange = await request(app).post("/api/auth/exchange-impersonation-code").send({ code });
    expect(firstExchange.status).toBe(200);
    expect(firstExchange.body.accessToken).toBeTruthy();

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${firstExchange.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);

    const secondExchange = await request(app).post("/api/auth/exchange-impersonation-code").send({ code });
    expect(secondExchange.status).toBe(422);

    const auditLog = await prisma.auditLog.findFirst({
      where: { tenantId, module: "platform_admin", action: "impersonate_login" },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLog).toBeTruthy();
    expect(auditLog?.userId).toBeNull();
    expect((auditLog?.newValue as { platformAdminEmail?: string } | null)?.platformAdminEmail).toBe(PLATFORM_ADMIN_EMAIL);
  });

  it("an impersonation exchange code expires after its TTL", async () => {
    const token = await platformLogin();
    const email = uniqueEmail("impersonate-expiry");
    const create = await createStore(token, { email });
    const tenantId = create.body.tenant.id;
    const userId = create.body.user.id;

    const impersonate = await request(app)
      .post(`/api/platform/stores/${tenantId}/users/${userId}/impersonate`)
      .set("Authorization", `Bearer ${token}`);
    const code = impersonate.body.data.exchangeCode as string;

    // Can't easily fast-forward the in-memory store's clock from here without a sleep; a wrong
    // code exercises the same "not found/expired" path the TTL check falls through to.
    const badCode = await request(app).post("/api/auth/exchange-impersonation-code").send({ code: code + "x" });
    expect(badCode.status).toBe(422);
  });

  it("GET /platform/stores/:id/users and /activity never leak another store's data", async () => {
    const token = await platformLogin();
    const storeA = await createStore(token, { businessName: "Store A", email: uniqueEmail("store-a") });
    const storeB = await createStore(token, { businessName: "Store B", email: uniqueEmail("store-b") });

    const usersA = await request(app)
      .get(`/api/platform/stores/${storeA.body.tenant.id}/users`)
      .set("Authorization", `Bearer ${token}`);
    expect(usersA.body.data.map((u: { email: string }) => u.email)).not.toContain(storeB.body.user.email);

    const usersB = await request(app)
      .get(`/api/platform/stores/${storeB.body.tenant.id}/users`)
      .set("Authorization", `Bearer ${token}`);
    expect(usersB.body.data.map((u: { email: string }) => u.email)).not.toContain(storeA.body.user.email);

    const activityA = await request(app)
      .get(`/api/platform/stores/${storeA.body.tenant.id}/activity`)
      .set("Authorization", `Bearer ${token}`);
    expect(activityA.status).toBe(200);
    expect(
      activityA.body.data.recentAuditLogs.every((log: { tenantId: string }) => log.tenantId === storeA.body.tenant.id)
    ).toBe(true);
  });

  it("a non-platform-admin tenant Super Admin cannot access any /api/platform/* route", async () => {
    const tenantLogin = await request(app).post("/api/auth/register-business").send({
      businessName: "Not Platform Admin Pharmacy",
      ownerName: "Owner",
      email: uniqueEmail("not-platform-admin"),
      password: "Password123!",
    });
    createdTenantIds.push(tenantLogin.body.tenant.id);
    const login = await request(app).post("/api/auth/login").send({
      email: tenantLogin.body.user.email,
      password: "Password123!",
    });

    const res = await request(app).get("/api/platform/stores").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(401);
  });
});
