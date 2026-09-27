// Development-only demo data (spec section 50). Never run against a production database.
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { seedDefaultRolesForTenant } from "../src/lib/tenantSetup";

const DEMO_PASSWORD = "Demo@12345";

async function main() {
  const existing = await prisma.tenant.findFirst({ where: { businessName: "Demo Medical Store" } });
  if (existing) {
    console.log("Demo tenant already exists, skipping seed. Tenant id:", existing.id);
    return;
  }

  const tenant = await prisma.tenant.create({
    data: {
      businessName: "Demo Medical Store",
      legalName: "Demo Medical Store Pvt Ltd",
      ownerName: "Demo Owner",
      email: "owner@demo-pharmacy.test",
      gstin: "27AAAAA0000A1Z5",
      state: "Maharashtra",
      city: "Pune",
    },
  });

  const branch = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Main Branch", invoicePrefix: "INV", gstin: tenant.gstin },
  });
  await prisma.warehouse.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Main Warehouse" } });
  await prisma.counter.create({ data: { tenantId: tenant.id, branchId: branch.id, name: "Counter 1" } });

  const roleIdByName = await seedDefaultRolesForTenant(tenant.id);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const demoUsers: Array<{ name: string; email: string; role: string }> = [
    { name: "Demo Owner", email: "owner@demo-pharmacy.test", role: "Super Admin" },
    { name: "Demo Manager", email: "manager@demo-pharmacy.test", role: "Branch Manager" },
    { name: "Demo Pharmacist", email: "pharmacist@demo-pharmacy.test", role: "Pharmacist" },
    { name: "Demo Cashier", email: "cashier@demo-pharmacy.test", role: "Billing/Cashier" },
  ];

  for (const u of demoUsers) {
    const roleId = roleIdByName.get(u.role as never);
    if (!roleId) continue;
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: u.name,
        email: u.email,
        passwordHash,
        roleId,
        userBranches: { create: [{ branchId: branch.id }] },
      },
    });
  }

  console.log("Seed complete.");
  console.log("Demo login credentials (development only):");
  for (const u of demoUsers) {
    console.log(`  ${u.role.padEnd(16)} ${u.email}  /  ${DEMO_PASSWORD}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
