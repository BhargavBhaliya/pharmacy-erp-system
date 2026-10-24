"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSchema = exports.registerBusinessSchema = void 0;
const zod_1 = require("zod");
exports.registerBusinessSchema = zod_1.z.object({
    businessName: zod_1.z.string().min(2).max(200),
    ownerName: zod_1.z.string().min(2).max(200),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
    phone: zod_1.z.string().min(6).max(20).optional(),
});
// Field is still called "email" for API-compatibility (existing clients/tests), but it now
// accepts a username too — the service looks up both in one query, so the caller never needs
// to say which kind this is. Validation is deliberately NOT .email() anymore since a username
// won't pass that shape.
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1),
});
