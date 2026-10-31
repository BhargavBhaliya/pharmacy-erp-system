-- CreateIndex (create replacement first — MySQL refuses to drop an index still backing a
-- foreign key constraint until a substitute covering index exists)
CREATE INDEX `sales_returns_tenantId_branchId_returnDate_idx` ON `sales_returns`(`tenantId`, `branchId`, `returnDate`);

-- DropIndex
DROP INDEX `sales_returns_tenantId_branchId_createdAt_idx` ON `sales_returns`;
