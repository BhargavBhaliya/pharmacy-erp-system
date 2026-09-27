import type { Db } from "./permissionsCatalog";

// Sum of (totalAmount - paidAmount) across a customer's non-cancelled sales — used both to
// display outstanding balance and to enforce credit limits before a new credit sale (spec
// section 31: "Block further credit sales if configured limit is exceeded").
export async function getCustomerOutstanding(db: Db, customerId: string): Promise<number> {
  const sales = await db.sale.findMany({
    where: { customerId, status: "CONFIRMED" },
    select: { totalAmount: true, paidAmount: true },
  });
  return sales.reduce((sum: number, s: { totalAmount: unknown; paidAmount: unknown }) => sum + Number(s.totalAmount) - Number(s.paidAmount), 0);
}
