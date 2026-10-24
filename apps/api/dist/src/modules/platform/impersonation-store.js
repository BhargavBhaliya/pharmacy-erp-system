"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExchangeCode = createExchangeCode;
exports.consumeExchangeCode = consumeExchangeCode;
const node_crypto_1 = __importDefault(require("node:crypto"));
// Short-lived, single-use exchange codes that hand off an already-issued tenant token pair
// (minted by the impersonate endpoint) to a new browser tab, without ever putting a raw token
// in a URL or localStorage. In-memory is sufficient here: there is exactly one Platform Admin
// and impersonation is an interactive, immediate action — this never needs to survive a
// process restart or be shared across API instances.
const TTL_MS = 60_000;
const codes = new Map();
function cleanupExpired() {
    const now = Date.now();
    for (const [code, payload] of codes) {
        if (payload.used || payload.expiresAt < now)
            codes.delete(code);
    }
}
function createExchangeCode(accessToken, refreshToken) {
    cleanupExpired();
    const code = node_crypto_1.default.randomBytes(24).toString("base64url");
    codes.set(code, { accessToken, refreshToken, expiresAt: Date.now() + TTL_MS, used: false });
    return code;
}
function consumeExchangeCode(code) {
    const payload = codes.get(code);
    if (!payload || payload.used || payload.expiresAt < Date.now())
        return null;
    payload.used = true;
    codes.delete(code);
    return { accessToken: payload.accessToken, refreshToken: payload.refreshToken };
}
