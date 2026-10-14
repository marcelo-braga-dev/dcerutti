-- Campanhas de cupom (docs/20-cupons.md, fase 4): primeira compra e próxima compra (modelo + cupons pessoais).
-- AlterTable
ALTER TABLE `cupom` ADD COLUMN `diasAposCadastro` INTEGER NULL,
    ADD COLUMN `modelo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `modeloId` INTEGER NULL,
    ADD COLUMN `origem` ENUM('manual', 'primeiraCompra', 'proximaCompra') NOT NULL DEFAULT 'manual',
    ADD COLUMN `pedidoOrigemId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `cupom_origem_modelo_idx` ON `cupom`(`origem`, `modelo`);

-- CreateIndex
CREATE INDEX `cupom_modeloId_idx` ON `cupom`(`modeloId`);

-- AddForeignKey
ALTER TABLE `cupom` ADD CONSTRAINT `cupom_modeloId_fkey` FOREIGN KEY (`modeloId`) REFERENCES `cupom`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

