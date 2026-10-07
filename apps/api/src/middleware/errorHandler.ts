import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import { AppError } from "../lib/errors";

// Connection-level Prisma failures (host unreachable, pool exhausted, server closed the
// connection) survive lib/prisma.ts's own retry wrapper when the outage outlasts those few
// retries — at that point the honest answer is "the database is unreachable right now", not a
// generic 500, so a client (or a future "please retry" banner in the UI) can tell the two apart.
function isDatabaseUnavailableError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P1001", "P1002", "P1008", "P1017"].includes(err.code);
  }
  return false;
}

// Centralized error handler: never leak stack traces / raw DB errors to clients
// (spec section 48). Every response gets an errorId that's also logged server-side
// so a user's bug report can be correlated with server logs.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const errorId = crypto.randomUUID();

  if (isDatabaseUnavailableError(err)) {
    req.log?.error({ err, errorId }, "Database unavailable");
    return res.status(503).json({
      error: {
        id: errorId,
        code: "DATABASE_UNAVAILABLE",
        message: "The database is temporarily unreachable. Please try again in a moment.",
      },
    });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        id: errorId,
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: err.flatten(),
      },
    });
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      req.log?.error({ err, errorId }, "AppError");
    }
    return res.status(err.statusCode).json({
      error: {
        id: errorId,
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  req.log?.error({ err, errorId }, "Unhandled error");
  return res.status(500).json({
    error: {
      id: errorId,
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again or contact support.",
    },
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
  });
}
