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

describe("settings", () => {
  it("updates the business profile", async () => {
    const t = await setupTenant("Settings Pharmacy 1");
    const res = await request(app)
      .put("/api/settings/business")
      .set("Authorization", `Bearer ${t.token}`)
      .send({ gstin: "27ABCDE1234F1Z5", invoiceFooter: "Thank you for shopping with us" });

    expect(res.status).toBe(200);
    expect(res.body.data.gstin).toBe("27ABCDE1234F1Z5");
    expect(res.body.data.invoiceFooter).toBe("Thank you for shopping with us");
  });

  it("reads and writes a generic tenant-wide setting", async () => {
    const t = await setupTenant("Settings Pharmacy 2");

    const missing = await request(app).get("/api/settings/expiryWarningDays").set("Authorization", `Bearer ${t.token}`);
    expect(missing.body.data).toBeNull();

    const write = await request(app).put("/api/settings/expiryWarningDays").set("Authorization", `Bearer ${t.token}`).send({ value: 45 });
    expect(write.status).toBe(200);

    const read = await request(app).get("/api/settings/expiryWarningDays").set("Authorization", `Bearer ${t.token}`);
    expect(read.body.data).toBe(45);
  });

  it("exports the tenant's own data as a JSON attachment without leaking other tenants", async () => {
    const t1 = await setupTenant("Settings Pharmacy 3");
    const t2 = await setupTenant("Settings Pharmacy 4");

    await request(app).post("/api/suppliers").set("Authorization", `Bearer ${t1.token}`).send({ name: "Only In Tenant 1" });
    await request(app).post("/api/suppliers").set("Authorization", `Bearer ${t2.token}`).send({ name: "Only In Tenant 2" });

    const exportRes = await request(app).get("/api/settings/export/data").set("Authorization", `Bearer ${t1.token}`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers["content-disposition"]).toContain("attachment");
    expect(exportRes.body.tenant.id).toBe(t1.tenantId);
    expect(exportRes.body.suppliers.some((s: { name: string }) => s.name === "Only In Tenant 1")).toBe(true);
    expect(exportRes.body.suppliers.some((s: { name: string }) => s.name === "Only In Tenant 2")).toBe(false);
  });
});

// A 1x1 transparent PNG — small enough to inline, real enough to pass magic-byte validation.
const REAL_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478" +
    "9c63f8ffff3f0005fe02fedccc59e70000000049454e44ae426082",
  "hex"
);

describe("branding image upload", () => {
  it("accepts a real PNG and rejects a non-image file even when it claims to be one", async () => {
    const t = await setupTenant("Settings Pharmacy 5");

    const good = await request(app)
      .post("/api/settings/upload-logo")
      .set("Authorization", `Bearer ${t.token}`)
      .attach("file", REAL_PNG, { filename: "logo.png", contentType: "image/png" });
    expect(good.status).toBe(201);
    expect(good.body.data.url).toContain(t.tenantId);

    // Same declared Content-Type as a real PNG, but the actual bytes are plain text — this is
    // exactly the spoofing multer's fileFilter alone can't catch (it only sees the client-
    // supplied mimetype), which is what the magic-byte check on disk exists to catch.
    const spoofed = await request(app)
      .post("/api/settings/upload-logo")
      .set("Authorization", `Bearer ${t.token}`)
      .attach("file", Buffer.from("<script>alert(1)</script>"), { filename: "fake.png", contentType: "image/png" });
    expect(spoofed.status).toBe(422);
    expect(spoofed.body.error.message).toMatch(/doesn't match a valid/i);
  });
});
