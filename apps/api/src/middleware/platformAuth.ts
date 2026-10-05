import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { verifyPlatformAccessToken } from "../lib/platformJwt";
import { UnauthorizedError } from "../lib/errors";

// Sibling to middleware/auth.ts, not a modification of it — a Platform Admin is not a tenant
// principal and must never share a code path with tenant-user authentication.
export async function authenticatePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing bearer token");
    }
    const token = header.slice("Bearer ".length);
    const payload = verifyPlatformAccessToken(token);

    const admin = await prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
    if (!admin) throw new UnauthorizedError("Account no longer exists");

    req.platformAdmin = { id: admin.id, name: admin.name, email: admin.email };
    next();
  } catch (err) {
    next(err instanceof Error && !(err instanceof UnauthorizedError) ? new UnauthorizedError() : err);
  }
}
