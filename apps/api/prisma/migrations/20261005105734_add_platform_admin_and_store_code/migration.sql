-- Platform Super Admin: a single operator identity outside any tenant, with its own
-- refresh-token table (cannot reuse refresh_tokens, which has a non-nullable FK to users).
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

CREATE TABLE "platform_refresh_tokens" (
    "id" TEXT NOT NULL,
    "platformAdminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_refresh_tokens_tokenHash_key" ON "platform_refresh_tokens"("tokenHash");
CREATE INDEX "platform_refresh_tokens_platformAdminId_idx" ON "platform_refresh_tokens"("platformAdminId");

ALTER TABLE "platform_refresh_tokens" ADD CONSTRAINT "platform_refresh_tokens_platformAdminId_fkey"
    FOREIGN KEY ("platformAdminId") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Human-readable store identifier (distinct from the opaque tenant id). Add nullable first,
-- backfill existing rows in createdAt order, then enforce NOT NULL + UNIQUE.
ALTER TABLE "tenants" ADD COLUMN "storeCode" TEXT;

WITH numbered AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
    FROM "tenants"
)
UPDATE "tenants" t
SET "storeCode" = 'STORE-' || LPAD(numbered.rn::text, 4, '0')
FROM numbered
WHERE t."id" = numbered."id";

ALTER TABLE "tenants" ALTER COLUMN "storeCode" SET NOT NULL;
CREATE UNIQUE INDEX "tenants_storeCode_key" ON "tenants"("storeCode");
