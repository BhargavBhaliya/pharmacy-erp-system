"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticatePlatformAdmin = authenticatePlatformAdmin;
const prisma_1 = require("../lib/prisma");
const platformJwt_1 = require("../lib/platformJwt");
const errors_1 = require("../lib/errors");
// Sibling to middleware/auth.ts, not a modification of it — a Platform Admin is not a tenant
// principal and must never share a code path with tenant-user authentication.
async function authenticatePlatformAdmin(req, _res, next) {
    try {
        const header = req.headers.authorization;
        if (!header?.startsWith("Bearer ")) {
            throw new errors_1.UnauthorizedError("Missing bearer token");
        }
        const token = header.slice("Bearer ".length);
        const payload = (0, platformJwt_1.verifyPlatformAccessToken)(token);
        const admin = await prisma_1.prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
        if (!admin)
            throw new errors_1.UnauthorizedError("Account no longer exists");
        req.platformAdmin = { id: admin.id, name: admin.name, email: admin.email, username: admin.username };
        next();
    }
    catch (err) {
        next(err instanceof Error && !(err instanceof errors_1.UnauthorizedError) ? new errors_1.UnauthorizedError() : err);
    }
}
