import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import crypto from "node:crypto";
import { AppError } from "../lib/errors";

// Centralized error handler: never leak stack traces / raw DB errors to clients
// (spec section 48). Every response gets an errorId that's also logged server-side
// so a user's bug report can be correlated with server logs.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const errorId = crypto.randomUUID();

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
