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

describe("auth", () => {
  it("registers a new business with a Business Owner user and default roles", async () => {
    const email = uniqueEmail("owner");
    const res = await request(app).post("/api/auth/register-business").send({
      businessName: "Test Pharmacy",
      ownerName: "Test Owner",
      email,
      password: "Password123!",
    });

    expect(res.status).toBe(201);
    expect(res.body.tenant.businessName).toBe("Test Pharmacy");
    createdTenantIds.push(res.body.tenant.id);

    const roles = await prisma.role.findMany({ where: { tenantId: res.body.tenant.id } });
    expect(roles.length).toBe(11); // DEFAULT_ROLES
  });

  it("rejects registering the same email twice", async () => {
    const email = uniqueEmail("dupe");
    const first = await request(app).post("/api/auth/register-business").send({
      businessName: "Dupe Pharmacy",
      ownerName: "Owner",
      email,
      password: "Password123!",
    });
    createdTenantIds.push(first.body.tenant.id);

    const second = await request(app).post("/api/auth/register-business").send({
      businessName: "Dupe Pharmacy 2",
      ownerName: "Owner",
      email,
      password: "Password123!",
    });
    expect(second.status).toBe(409);
  });

  it("logs in with correct credentials and rejects wrong password", async () => {
    const email = uniqueEmail("login");
    const reg = await request(app).post("/api/auth/register-business").send({
      businessName: "Login Pharmacy",
      ownerName: "Owner",
      email,
      password: "Password123!",
    });
    createdTenantIds.push(reg.body.tenant.id);

    const badLogin = await request(app).post("/api/auth/login").send({ email, password: "wrong" });
    expect(badLogin.status).toBe(401);

    const goodLogin = await request(app).post("/api/auth/login").send({ email, password: "Password123!" });
    expect(goodLogin.status).toBe(200);
    expect(goodLogin.body.accessToken).toBeTruthy();
    expect(goodLogin.body.user.email).toBe(email);
  });

  it("returns profile with full permission set for the Business Owner via /me", async () => {
    const email = uniqueEmail("me");
    const reg = await request(app).post("/api/auth/register-business").send({
      businessName: "Me Pharmacy",
      ownerName: "Owner",
      email,
      password: "Password123!",
    });
    createdTenantIds.push(reg.body.tenant.id);

    const login = await request(app).post("/api/auth/login").send({ email, password: "Password123!" });
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.permissions).toEqual(expect.arrayContaining(["users.add", "branches.view", "products.delete"]));
  });

  it("rejects requests with no token and with a garbage token", async () => {
    const noToken = await request(app).get("/api/auth/me");
    expect(noToken.status).toBe(401);

    const badToken = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-real-token");
    expect(badToken.status).toBe(401);
  });

  it("supports refresh-token rotation via cookie", async () => {
    const email = uniqueEmail("refresh");
    const reg = await request(app).post("/api/auth/register-business").send({
      businessName: "Refresh Pharmacy",
      ownerName: "Owner",
      email,
      password: "Password123!",
    });
    createdTenantIds.push(reg.body.tenant.id);

    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ email, password: "Password123!" });
    expect(login.status).toBe(200);

    const refreshed = await agent.post("/api/auth/refresh");
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();

    // The rotated refresh token cookie must work for a subsequent refresh...
    const secondRefresh = await agent.post("/api/auth/refresh");
    expect(secondRefresh.status).toBe(200);

    // ...and the new access token must actually authenticate.
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${refreshed.body.accessToken}`);
    expect(me.status).toBe(200);
  });
});
