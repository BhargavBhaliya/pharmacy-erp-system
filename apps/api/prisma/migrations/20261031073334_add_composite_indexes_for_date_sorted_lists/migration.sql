-- CreateIndex (create replacements first — MySQL refuses to drop an index that's still backing
-- a foreign key constraint until a substitute covering index exists)
CREATE INDEX `cash_sessions_tenantId_branchId_openedAt_idx` ON `cash_sessions`(`tenantId`, `branchId`, `openedAt`);

CREATE INDEX `customers_tenantId_name_idx` ON `customers`(`tenantId`, `name`);

CREATE INDEX `expenses_tenantId_branchId_createdAt_idx` ON `expenses`(`tenantId`, `branchId`, `createdAt`);

CREATE INDEX `prescriptions_tenantId_branchId_prescriptionDate_idx` ON `prescriptions`(`tenantId`, `branchId`, `prescriptionDate`);

CREATE INDEX `purchase_orders_tenantId_branchId_createdAt_idx` ON `purchase_orders`(`tenantId`, `branchId`, `createdAt`);

CREATE INDEX `purchase_returns_tenantId_branchId_createdAt_idx` ON `purchase_returns`(`tenantId`, `branchId`, `createdAt`);

CREATE INDEX `purchases_tenantId_branchId_createdAt_idx` ON `purchases`(`tenantId`, `branchId`, `createdAt`);

CREATE INDEX `purchases_tenantId_branchId_purchaseDate_idx` ON `purchases`(`tenantId`, `branchId`, `purchaseDate`);

CREATE INDEX `receipts_tenantId_branchId_createdAt_idx` ON `receipts`(`tenantId`, `branchId`, `createdAt`);

CREATE INDEX `sales_tenantId_branchId_createdAt_idx` ON `sales`(`tenantId`, `branchId`, `createdAt`);

CREATE INDEX `sales_tenantId_branchId_saleDate_idx` ON `sales`(`tenantId`, `branchId`, `saleDate`);

CREATE INDEX `sales_returns_tenantId_branchId_createdAt_idx` ON `sales_returns`(`tenantId`, `branchId`, `createdAt`);

CREATE INDEX `supplier_payments_tenantId_branchId_createdAt_idx` ON `supplier_payments`(`tenantId`, `branchId`, `createdAt`);

-- DropIndex (now safe — each table above has a replacement index whose leftmost columns still
-- satisfy its tenantId/branchId foreign keys)
DROP INDEX `cash_sessions_tenantId_branchId_idx` ON `cash_sessions`;

DROP INDEX `expenses_tenantId_branchId_idx` ON `expenses`;

DROP INDEX `prescriptions_tenantId_branchId_idx` ON `prescriptions`;

DROP INDEX `purchase_orders_tenantId_branchId_idx` ON `purchase_orders`;

DROP INDEX `purchase_returns_tenantId_branchId_idx` ON `purchase_returns`;

DROP INDEX `purchases_tenantId_branchId_idx` ON `purchases`;

DROP INDEX `receipts_tenantId_branchId_idx` ON `receipts`;

DROP INDEX `sales_tenantId_branchId_idx` ON `sales`;

DROP INDEX `sales_returns_tenantId_branchId_idx` ON `sales_returns`;

DROP INDEX `supplier_payments_tenantId_branchId_idx` ON `supplier_payments`;
