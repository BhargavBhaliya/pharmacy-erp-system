import crypto from "node:crypto";

// Short-lived, single-use exchange codes that hand off an already-issued tenant token pair
// (minted by the impersonate endpoint) to a new browser tab, without ever putting a raw token
// in a URL or localStorage. In-memory is sufficient here: there is exactly one Platform Admin
// and impersonation is an interactive, immediate action — this never needs to survive a
// process restart or be shared across API instances.
const TTL_MS = 60_000;

interface ExchangePayload {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  used: boolean;
}

const codes = new Map<string, ExchangePayload>();

function cleanupExpired() {
  const now = Date.now();
  for (const [code, payload] of codes) {
    if (payload.used || payload.expiresAt < now) codes.delete(code);
  }
}

export function createExchangeCode(accessToken: string, refreshToken: string): string {
  cleanupExpired();
  const code = crypto.randomBytes(24).toString("base64url");
  codes.set(code, { accessToken, refreshToken, expiresAt: Date.now() + TTL_MS, used: false });
  return code;
}

export function consumeExchangeCode(code: string): { accessToken: string; refreshToken: string } | null {
  const payload = codes.get(code);
  if (!payload || payload.used || payload.expiresAt < Date.now()) return null;
  payload.used = true;
  codes.delete(code);
  return { accessToken: payload.accessToken, refreshToken: payload.refreshToken };
}
