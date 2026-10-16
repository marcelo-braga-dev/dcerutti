-- Caixa da loja física (D-23): formas de pagamento da venda.
-- CreateTable
CREATE TABLE `pagamento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` VARCHAR(191) NOT NULL,
    `forma` ENUM('pix', 'debito', 'credito', 'dinheiro') NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `parcelas` INTEGER NULL,
    `recebido` DECIMAL(10, 2) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pagamento_pedidoId_idx`(`pedidoId`),
    INDEX `pagamento_forma_criadoEm_idx`(`forma`, `criadoEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pagamento` ADD CONSTRAINT `pagamento_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

