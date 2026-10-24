"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.verifyAccessToken = verifyAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.hashRefreshToken = hashRefreshToken;
exports.refreshTokenExpiryDate = refreshTokenExpiryDate;
const node_crypto_1 = __importDefault(require("node:crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
function signAccessToken(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_ACCESS_SECRET, {
        expiresIn: env_1.env.JWT_ACCESS_EXPIRES_IN,
    });
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET);
}
// Refresh tokens are opaque random strings, not JWTs: we store only a hash of them in the
// `refresh_tokens` table so a stolen DB dump can't be replayed, and so we can revoke
// individual sessions (logout, password change) without a blocklist.
function generateRefreshToken() {
    return node_crypto_1.default.randomBytes(48).toString("hex");
}
function hashRefreshToken(token) {
    return node_crypto_1.default.createHash("sha256").update(token).digest("hex");
}
function refreshTokenExpiryDate() {
    const match = /^(\d+)([smhd])$/.exec(env_1.env.JWT_REFRESH_EXPIRES_IN);
    const amount = match ? Number(match[1]) : 7;
    const unit = match ? match[2] : "d";
    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return new Date(Date.now() + amount * (unitMs[unit] ?? unitMs.d));
}
