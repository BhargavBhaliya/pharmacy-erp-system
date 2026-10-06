import type { Db } from "./permissionsCatalog";

// Sequential, human-readable store identifier ("STORE-0001") shown in the Platform Admin
// console, distinct from the opaque Tenant.id. Backed by StoreCodeCounter's auto-increment id
// rather than `COUNT(*)` — a count-based approach races under concurrent tenant creation (two
// transactions can read the same count before either commits, producing a duplicate storeCode
// and aborting one of them); an inserted row's auto-increment id is atomic regardless of
// concurrency or transaction isolation level, and (unlike a Postgres sequence) works on MySQL too.
export async function nextStoreCode(db: Db): Promise<string> {
  const row = await db.storeCodeCounter.create({ data: {} });
  return `STORE-${String(row.id).padStart(4, "0")}`;
}
