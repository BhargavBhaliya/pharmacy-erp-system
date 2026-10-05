-- storeCode was generated via `tenant.count()` inside the creating transaction, which races
-- under concurrent creations (two transactions can read the same count before either commits,
-- producing a duplicate storeCode and aborting one of them). A Postgres sequence is atomic
-- regardless of concurrency or transaction isolation level.
CREATE SEQUENCE IF NOT EXISTS "store_code_seq";

-- Continue numbering after whatever storeCodes already exist, so existing tenants keep theirs.
SELECT setval('store_code_seq', GREATEST((SELECT COUNT(*) FROM "tenants"), 0));
