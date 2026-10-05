import type { Db } from "./permissionsCatalog";

// Sequential, human-readable store identifier ("STORE-0001") shown in the Platform Admin
// console, distinct from the opaque Tenant.id. Backed by a real Postgres sequence
// (store_code_seq) rather than `COUNT(*)` — a count-based approach races under concurrent
// tenant creation (two transactions can read the same count before either commits, producing
// a duplicate storeCode and aborting one of them); nextval() is atomic regardless of
// concurrency or transaction isolation level.
export async function nextStoreCode(db: Db): Promise<string> {
  const rows = await db.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('store_code_seq')`;
  const n = Number(rows[0].nextval);
  return `STORE-${String(n).padStart(4, "0")}`;
}
