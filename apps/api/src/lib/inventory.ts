import type { AdjustmentReason, StockTransactionType } from "@prisma/client";
import type { Db } from "./permissionsCatalog";
import { prisma } from "./prisma";
import { ValidationError } from "./errors";

export const DEFAULT_EXPIRY_WARNING_DAYS = 90;

export async function getExpiryWarningDays(tenantId: string): Promise<number> {
  const setting = await prisma.setting.findFirst({
    where: { tenantId, branchId: null, key: "expiryWarningDays" },
  });
  const value = setting?.value;
  return typeof value === "number" ? value : DEFAULT_EXPIRY_WARNING_DAYS;
}

// FEFO (First Expiry, First Out): sellable batches ordered soonest-to-expire first, excluding
// already-expired and blocked (on-hold) batches. Spec section 7 & 55.2 ("never sell expired").
export async function findAvailableBatchesFefo(
  db: Db,
  params: { tenantId: string; branchId: string; productId: string }
) {
  return db.batch.findMany({
    where: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      productId: params.productId,
      quantity: { gt: 0 },
      isBlocked: false,
      expiryDate: { gt: new Date() },
    },
    orderBy: { expiryDate: "asc" },
  });
}

interface AdjustStockParams {
  tenantId: string;
  branchId: string;
  batchId: string;
  productId: string;
  quantityDelta: number; // positive = stock in, negative = stock out
  type: StockTransactionType;
  reason?: AdjustmentReason;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  createdById?: string;
  /** Allow reducing stock on an expired batch (write-offs, returns) but never for a SALE. */
  allowExpired?: boolean;
}

// The one place batch quantity is ever mutated. Always run inside a transaction alongside
// whatever business operation triggered it (purchase, sale, transfer, adjustment) so the
// ledger row and the balance update commit atomically (spec section 55.7).
export async function adjustStock(db: Db, params: AdjustStockParams) {
  const batch = await db.batch.findFirst({
    where: { id: params.batchId, tenantId: params.tenantId, branchId: params.branchId },
  });
  if (!batch) throw new ValidationError("Batch not found for this branch");

  if (params.type === "SALE" && batch.expiryDate <= new Date()) {
    throw new ValidationError("This batch is expired and cannot be sold");
  }

  const newQuantity = batch.quantity + params.quantityDelta;
  if (newQuantity < 0) {
    throw new ValidationError(
      `Insufficient stock in batch ${batch.batchNumber}: available ${batch.quantity}, requested ${-params.quantityDelta}`
    );
  }

  const updatedBatch = await db.batch.update({ where: { id: batch.id }, data: { quantity: newQuantity } });

  const transaction = await db.stockTransaction.create({
    data: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      productId: params.productId,
      batchId: params.batchId,
      type: params.type,
      quantity: params.quantityDelta,
      reason: params.reason,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      notes: params.notes,
      createdById: params.createdById,
    },
  });

  return { batch: updatedBatch, transaction };
}
