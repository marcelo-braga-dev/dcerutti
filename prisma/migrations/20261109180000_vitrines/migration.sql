-- AlterTable
ALTER TABLE `atendimento` ADD COLUMN `vitrineId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `pedido` ADD COLUMN `vitrineId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `vitrine` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `tipo` ENUM('live', 'post', 'reels', 'story') NOT NULL,
    `status` ENUM('rascunho', 'agendada', 'no_ar', 'publicada', 'encerrada', 'arquivada') NOT NULL DEFAULT 'rascunho',
    `titulo` VARCHAR(120) NOT NULL,
    `descricao` TEXT NULL,
    `urlInstagram` VARCHAR(300) NULL,
    `legenda` TEXT NULL,
    `responsavelId` VARCHAR(191) NOT NULL,
    `inicioPrevisto` DATETIME(3) NULL,
    `inicioEm` DATETIME(3) NULL,
    `fimEm` DATETIME(3) NULL,
    `ofertaAte` DATETIME(3) NULL,
    `visitas` INTEGER NOT NULL DEFAULT 0,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizadoEm` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vitrine_slug_key`(`slug`),
    INDEX `vitrine_status_inicioPrevisto_idx`(`status`, `inicioPrevisto`),
    INDEX `vitrine_responsavelId_idx`(`responsavelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vitrine_peca` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vitrineId` VARCHAR(191) NOT NULL,
    `produtoId` INTEGER NOT NULL,
    `ordem` INTEGER NOT NULL DEFAULT 0,
    `precoOferta` DECIMAL(10, 2) NULL,

    INDEX `vitrine_peca_produtoId_idx`(`produtoId`),
    UNIQUE INDEX `vitrine_peca_vitrineId_produtoId_key`(`vitrineId`, `produtoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `atendimento_vitrineId_criadoEm_idx` ON `atendimento`(`vitrineId`, `criadoEm`);

-- CreateIndex
CREATE INDEX `pedido_vitrineId_status_idx` ON `pedido`(`vitrineId`, `status`);

-- AddForeignKey
ALTER TABLE `pedido` ADD CONSTRAINT `pedido_vitrineId_fkey` FOREIGN KEY (`vitrineId`) REFERENCES `vitrine`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `atendimento` ADD CONSTRAINT `atendimento_vitrineId_fkey` FOREIGN KEY (`vitrineId`) REFERENCES `vitrine`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vitrine` ADD CONSTRAINT `vitrine_responsavelId_fkey` FOREIGN KEY (`responsavelId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vitrine_peca` ADD CONSTRAINT `vitrine_peca_vitrineId_fkey` FOREIGN KEY (`vitrineId`) REFERENCES `vitrine`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vitrine_peca` ADD CONSTRAINT `vitrine_peca_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

