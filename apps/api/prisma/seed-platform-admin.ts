// One-time, run-by-hand script to create the single Platform Super Admin account. Deliberately
// NOT an HTTP endpoint — there is no API route that can create a PlatformAdmin, ever, so this
// is the only way one gets created. Run from apps/api: npx tsx prisma/seed-platform-admin.ts
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";

async function main() {
  const existingCount = await prisma.platformAdmin.count();
  if (existingCount > 0) {
    console.log(`A platform admin already exists (${existingCount} total). Refusing to create another.`);
    console.log("If you need to change the password, update it directly in the database or add a dedicated script for that.");
    return;
  }

  const name = process.env.PLATFORM_ADMIN_NAME;
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.error("Set PLATFORM_ADMIN_NAME, PLATFORM_ADMIN_EMAIL, and PLATFORM_ADMIN_PASSWORD env vars before running this script.");
    console.error('Example: PLATFORM_ADMIN_NAME="Admin" PLATFORM_ADMIN_EMAIL="admin@example.com" PLATFORM_ADMIN_PASSWORD="ChangeMe123!" npx tsx prisma/seed-platform-admin.ts');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error("PLATFORM_ADMIN_PASSWORD must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.platformAdmin.create({ data: { name, email, passwordHash } });
  console.log(`Platform admin created: ${admin.email} (id: ${admin.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
