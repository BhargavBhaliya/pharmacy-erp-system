import type { Prisma, PrismaClient } from "@prisma/client";
import { MODULE_ACTIONS, PERMISSION_MODULES } from "@pharmacy-erp/shared";
import { prisma } from "./prisma";

export type Db = PrismaClient | Prisma.TransactionClient;

// Idempotent: upserts the full (module, action) permission catalog. Safe to call on every
// boot so new permissions introduced by later phases show up without a manual migration step.
export async function ensureGlobalPermissions(db: Db = prisma): Promise<void> {
  const rows = PERMISSION_MODULES.flatMap((module) =>
    MODULE_ACTIONS[module].map((action) => ({
      module,
      action,
      code: `${module}.${action}`,
    }))
  );

  for (const row of rows) {
    await db.permission.upsert({
      where: { code: row.code },
      update: {},
      create: row,
    });
  }
}
