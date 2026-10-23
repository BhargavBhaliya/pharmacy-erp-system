-- DropForeignKey
ALTER TABLE `purchase_returns` DROP FOREIGN KEY `purchase_returns_purchaseId_fkey`;

-- AlterTable
ALTER TABLE `purchase_return_items` ADD COLUMN `purchaseItemId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `purchase_returns` MODIFY `purchaseId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `purchase_return_items_purchaseItemId_idx` ON `purchase_return_items`(`purchaseItemId`);

-- AddForeignKey
ALTER TABLE `purchase_returns` ADD CONSTRAINT `purchase_returns_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `purchases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_return_items` ADD CONSTRAINT `purchase_return_items_purchaseItemId_fkey` FOREIGN KEY (`purchaseItemId`) REFERENCES `purchase_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

