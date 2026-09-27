-- DropForeignKey
ALTER TABLE "receipt_allocations" DROP CONSTRAINT "receipt_allocations_saleId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_payment_allocations" DROP CONSTRAINT "supplier_payment_allocations_purchaseId_fkey";

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
