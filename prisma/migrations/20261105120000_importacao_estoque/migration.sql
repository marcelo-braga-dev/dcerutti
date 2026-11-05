-- AlterTable
ALTER TABLE `produto` ADD COLUMN `fornecedor` VARCHAR(80) NULL;

-- CreateTable
CREATE TABLE `importacao_estoque` (
    `id` VARCHAR(191) NOT NULL,
    `arquivo` VARCHAR(200) NOT NULL,
    `nomeOriginal` VARCHAR(200) NOT NULL,
    `usuarioId` VARCHAR(191) NULL,
    `resumo` JSON NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `importacao_estoque_criadoEm_idx`(`criadoEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `produto_fornecedor_idx` ON `produto`(`fornecedor`);

-- AddForeignKey
ALTER TABLE `importacao_estoque` ADD CONSTRAINT `importacao_estoque_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

