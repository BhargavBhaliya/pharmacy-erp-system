"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signPlatformAccessToken = signPlatformAccessToken;
exports.verifyPlatformAccessToken = verifyPlatformAccessToken;
exports.generatePlatformRefreshToken = generatePlatformRefreshToken;
exports.hashPlatformRefreshToken = hashPlatformRefreshToken;
exports.platformRefreshTokenExpiryDate = platformRefreshTokenExpiryDate;
const node_crypto_1 = __importDefault(require("node:crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
function signPlatformAccessToken(platformAdminId) {
    const payload = { sub: platformAdminId, scope: "platform" };
    return jsonwebtoken_1.default.sign(payload, env_1.env.PLATFORM_JWT_ACCESS_SECRET, {
        expiresIn: env_1.env.PLATFORM_JWT_ACCESS_EXPIRES_IN,
    });
}
function verifyPlatformAccessToken(token) {
    const payload = jsonwebtoken_1.default.verify(token, env_1.env.PLATFORM_JWT_ACCESS_SECRET);
    if (payload.scope !== "platform")
        throw new Error("Not a platform admin token");
    return payload;
}
function generatePlatformRefreshToken() {
    return node_crypto_1.default.randomBytes(48).toString("hex");
}
function hashPlatformRefreshToken(token) {
    return node_crypto_1.default.createHash("sha256").update(token).digest("hex");
}
function platformRefreshTokenExpiryDate() {
    const match = /^(\d+)([smhd])$/.exec(env_1.env.PLATFORM_JWT_REFRESH_EXPIRES_IN);
    const amount = match ? Number(match[1]) : 7;
    const unit = match ? match[2] : "d";
    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return new Date(Date.now() + amount * (unitMs[unit] ?? unitMs.d));
}
