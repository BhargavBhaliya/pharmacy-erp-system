-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "batches_supplierId_idx" ON "batches"("supplierId");

-- CreateIndex
CREATE INDEX "batches_manufacturerId_idx" ON "batches"("manufacturerId");

-- CreateIndex
CREATE INDEX "cash_sessions_counterId_status_idx" ON "cash_sessions"("counterId", "status");

-- CreateIndex
CREATE INDEX "sales_return_items_saleItemId_idx" ON "sales_return_items"("saleItemId");

-- CreateIndex
CREATE INDEX "stock_transfers_fromBranchId_idx" ON "stock_transfers"("fromBranchId");

-- CreateIndex
CREATE INDEX "stock_transfers_toBranchId_idx" ON "stock_transfers"("toBranchId");
