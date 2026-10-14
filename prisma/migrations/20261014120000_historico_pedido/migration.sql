-- Edição do pedido pelo vendedor: preço do catálogo de cada peça, para mostrar o desconto dado.
ALTER TABLE `pedido_item` ADD COLUMN `precoTabela` DECIMAL(10, 2) NULL;
UPDATE `pedido_item` SET `precoTabela` = `precoUnitario`;

-- Histórico do pedido: criação, edições da equipe, confirmação e cancelamento.
CREATE TABLE `pedido_historico` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` VARCHAR(191) NOT NULL,
    `acao` ENUM('criado', 'editado', 'confirmado', 'cancelado') NOT NULL,
    `autor` VARCHAR(10) NOT NULL,
    `usuarioId` VARCHAR(191) NULL,
    `nomeUsuario` VARCHAR(191) NULL,
    `mudancas` JSON NOT NULL,
    `itens` JSON NOT NULL,
    `total` DECIMAL(10, 2) NOT NULL,
    `frete` DECIMAL(10, 2) NULL,
    `observacao` TEXT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pedido_historico_pedidoId_criadoEm_idx`(`pedidoId`, `criadoEm`),
    INDEX `pedido_historico_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `pedido_historico` ADD CONSTRAINT `pedido_historico_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `pedido_historico` ADD CONSTRAINT `pedido_historico_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
