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

async function registerAndLogin(businessName: string) {
  const email = uniqueEmail("owner");
  const reg = await request(app).post("/api/auth/register-business").send({
    businessName,
    ownerName: "Owner",
    email,
    password: "Password123!",
  });
  createdTenantIds.push(reg.body.tenant.id);
  const login = await request(app).post("/api/auth/login").send({ email, password: "Password123!" });
  return { tenantId: reg.body.tenant.id, branchId: reg.body.branch.id, accessToken: login.body.accessToken as string };
}

describe("RBAC enforcement", () => {
  it("blocks a Billing/Cashier from viewing users or branches (missing permission)", async () => {
    const owner = await registerAndLogin("RBAC Pharmacy");

    const roles = await request(app).get("/api/roles").set("Authorization", `Bearer ${owner.accessToken}`);
    const cashierRole = roles.body.data.find((r: { name: string }) => r.name === "Billing/Cashier");
    expect(cashierRole).toBeTruthy();

    const cashierEmail = uniqueEmail("cashier");
    const createUser = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Cashier One", email: cashierEmail, password: "Password123!", roleId: cashierRole.id, branchIds: [owner.branchId] });
    expect(createUser.status).toBe(201);

    const cashierLogin = await request(app).post("/api/auth/login").send({ email: cashierEmail, password: "Password123!" });
    expect(cashierLogin.status).toBe(200);

    const blockedUsers = await request(app).get("/api/users").set("Authorization", `Bearer ${cashierLogin.body.accessToken}`);
    expect(blockedUsers.status).toBe(403);

    const blockedBranches = await request(app).get("/api/branches").set("Authorization", `Bearer ${cashierLogin.body.accessToken}`);
    expect(blockedBranches.status).toBe(403);
  });

  it("prevents one tenant from reading another tenant's branch data", async () => {
    const tenantA = await registerAndLogin("Tenant A Pharmacy");
    const tenantB = await registerAndLogin("Tenant B Pharmacy");

    const crossAccess = await request(app)
      .get(`/api/branches/${tenantB.branchId}`)
      .set("Authorization", `Bearer ${tenantA.accessToken}`);

    expect(crossAccess.status).toBe(404);
  });

  it("rejects assigning a role that belongs to a different tenant", async () => {
    const tenantA = await registerAndLogin("Tenant C Pharmacy");
    const tenantB = await registerAndLogin("Tenant D Pharmacy");

    const rolesB = await request(app).get("/api/roles").set("Authorization", `Bearer ${tenantB.accessToken}`);
    const foreignRoleId = rolesB.body.data[0].id;

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${tenantA.accessToken}`)
      .send({ name: "X", email: uniqueEmail("x"), password: "Password123!", roleId: foreignRoleId, branchIds: [] });

    expect(res.status).toBe(422);
  });
});
