-- Notificações da equipe (D-28): sino, página de notificações e preferências por pessoa.
-- AlterTable
ALTER TABLE `user` ADD COLUMN `preferenciasNotificacao` JSON NULL;

-- CreateTable
CREATE TABLE `notificacao` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `usuarioId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('pedido_novo', 'pedido_cancelado', 'carrinho_visto', 'carrinho_respondido', 'sacola_parada', 'prazo_vencendo', 'peca_esgotada', 'meta_batida', 'cliente_nova') NOT NULL,
    `titulo` VARCHAR(140) NOT NULL,
    `texto` VARCHAR(300) NULL,
    `link` VARCHAR(300) NULL,
    `chave` VARCHAR(100) NULL,
    `lidaEm` DATETIME(3) NULL,
    `criadaEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notificacao_usuarioId_lidaEm_criadaEm_idx`(`usuarioId`, `lidaEm`, `criadaEm`),
    INDEX `notificacao_criadaEm_idx`(`criadaEm`),
    UNIQUE INDEX `notificacao_usuarioId_chave_key`(`usuarioId`, `chave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notificacao` ADD CONSTRAINT `notificacao_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

