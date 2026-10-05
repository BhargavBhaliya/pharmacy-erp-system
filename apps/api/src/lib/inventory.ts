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

export interface FefoAllocation {
  batchId: string;
  batchNumber: string;
  mrp: number;
  gstRatePercent: number;
  quantity: number;
}

// Splits a requested quantity across the FEFO-ordered batches needed to cover it (a sale often
// spans more than one batch as the soonest-expiring one runs out). Throws if total available
// stock is insufficient — spec 55.1 ("sale cannot exceed available stock").
export async function allocateFefoQuantity(
  db: Db,
  params: { tenantId: string; branchId: string; productId: string; quantity: number }
): Promise<FefoAllocation[]> {
  const batches = await findAvailableBatchesFefo(db, params);
  const allocations: FefoAllocation[] = [];
  let remaining = params.quantity;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    allocations.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      mrp: Number(batch.mrp),
      gstRatePercent: Number(batch.gstRatePercent),
      quantity: take,
    });
    remaining -= take;
  }

  if (remaining > 0) {
    const totalAvailable = params.quantity - remaining;
    throw new ValidationError(
      `Insufficient stock: requested ${params.quantity}, only ${totalAvailable} available across non-expired batches`
    );
  }

  return allocations;
}

// Used when the cashier (or sale line) explicitly picks a batch/manufacturer instead of
// letting FEFO choose — sells only from that batch, never silently splitting into others.
export async function allocateSpecificBatch(
  db: Db,
  params: { tenantId: string; branchId: string; productId: string; batchId: string; quantity: number }
): Promise<FefoAllocation[]> {
  const batch = await db.batch.findFirst({
    where: { id: params.batchId, tenantId: params.tenantId, branchId: params.branchId, productId: params.productId },
  });
  if (!batch) throw new ValidationError("Selected batch not found for this product/branch");
  if (batch.isBlocked) throw new ValidationError(`Batch ${batch.batchNumber} is blocked and cannot be sold`);
  if (batch.expiryDate <= new Date()) throw new ValidationError(`Batch ${batch.batchNumber} is expired and cannot be sold`);
  if (batch.quantity < params.quantity) {
    throw new ValidationError(`Insufficient stock in batch ${batch.batchNumber}: available ${batch.quantity}, requested ${params.quantity}`);
  }

  return [
    {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      mrp: Number(batch.mrp),
      gstRatePercent: Number(batch.gstRatePercent),
      quantity: params.quantity,
    },
  ];
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
