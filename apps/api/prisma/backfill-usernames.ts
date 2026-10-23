// One-time backfill: generates a username for every existing User/PlatformAdmin row created
// before the username field existed. Run from apps/api: npx tsx prisma/backfill-usernames.ts
import { prisma } from "../src/lib/prisma";
import { generateUniqueUsername } from "../src/lib/username";

async function main() {
  const users = await prisma.user.findMany({ where: { username: null }, select: { id: true, name: true, email: true } });
  for (const u of users) {
    const username = await generateUniqueUsername(prisma, u.name || u.email, "user");
    await prisma.user.update({ where: { id: u.id }, data: { username } });
    console.log(`User ${u.email} -> username "${username}"`);
  }

  const admins = await prisma.platformAdmin.findMany({ where: { username: null }, select: { id: true, name: true, email: true } });
  for (const a of admins) {
    const username = await generateUniqueUsername(prisma, a.name || a.email, "platformAdmin");
    await prisma.platformAdmin.update({ where: { id: a.id }, data: { username } });
    console.log(`PlatformAdmin ${a.email} -> username "${username}"`);
  }

  console.log(`Backfilled ${users.length} user(s) and ${admins.length} platform admin(s).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
