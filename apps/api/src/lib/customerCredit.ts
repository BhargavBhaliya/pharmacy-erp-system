import type { Db } from "./permissionsCatalog";

// Sum of (totalAmount - paidAmount) across a customer's non-cancelled sales — used both to
// display outstanding balance and to enforce credit limits before a new credit sale (spec
// section 31: "Block further credit sales if configured limit is exceeded").
export async function getCustomerOutstanding(db: Db, customerId: string): Promise<number> {
  // Summed at the DB level (not fetched row-by-row) so this stays O(1) regardless of how many
  // sales the customer has — it runs inside the checkout transaction for every credit sale.
  const result = await db.sale.aggregate({
    where: { customerId, status: "CONFIRMED" },
    _sum: { totalAmount: true, paidAmount: true },
  });
  return Number(result._sum.totalAmount ?? 0) - Number(result._sum.paidAmount ?? 0);
}
