-- AlterTable
ALTER TABLE `platform_admins` ADD COLUMN `username` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `username` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `platform_admins_username_key` ON `platform_admins`(`username`);

-- CreateIndex
CREATE UNIQUE INDEX `users_username_key` ON `users`(`username`);
