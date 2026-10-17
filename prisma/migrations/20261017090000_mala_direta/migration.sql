-- Sugestões fases 2 e 3 (D-27): cupom no carrinho, fila de envio e mala direta (campanha).
-- AlterTable
ALTER TABLE `sugestao` ADD COLUMN `campanhaId` VARCHAR(191) NULL,
    ADD COLUMN `cupomCodigo` VARCHAR(30) NULL,
    ADD COLUMN `enviadaEm` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `campanha` (
    `id` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(15) NOT NULL,
    `criadaPorId` VARCHAR(191) NOT NULL,
    `titulo` VARCHAR(80) NOT NULL,
    `mensagem` TEXT NULL,
    `dias` INTEGER NOT NULL DEFAULT 7,
    `cupomCodigo` VARCHAR(30) NULL,
    `publico` JSON NOT NULL,
    `itens` JSON NOT NULL,
    `criadaEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `campanha_codigo_key`(`codigo`),
    INDEX `campanha_criadaPorId_criadaEm_idx`(`criadaPorId`, `criadaEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `sugestao_campanhaId_idx` ON `sugestao`(`campanhaId`);

-- AddForeignKey
ALTER TABLE `sugestao` ADD CONSTRAINT `sugestao_campanhaId_fkey` FOREIGN KEY (`campanhaId`) REFERENCES `campanha`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campanha` ADD CONSTRAINT `campanha_criadaPorId_fkey` FOREIGN KEY (`criadaPorId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Carrinhos já existentes foram enviados na criação.
UPDATE `sugestao` SET `enviadaEm` = `criadaEm` WHERE `campanhaId` IS NULL AND `enviadaEm` IS NULL;
