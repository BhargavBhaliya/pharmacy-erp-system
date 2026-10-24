"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureGlobalPermissions = ensureGlobalPermissions;
const shared_1 = require("@pharmacy-erp/shared");
const prisma_1 = require("./prisma");
// Idempotent: upserts the full (module, action) permission catalog. Safe to call on every
// boot so new permissions introduced by later phases show up without a manual migration step.
async function ensureGlobalPermissions(db = prisma_1.prisma) {
    const rows = shared_1.PERMISSION_MODULES.flatMap((module) => shared_1.MODULE_ACTIONS[module].map((action) => ({
        module,
        action,
        code: `${module}.${action}`,
    })));
    for (const row of rows) {
        await db.permission.upsert({
            where: { code: row.code },
            update: {},
            create: row,
        });
    }
}
