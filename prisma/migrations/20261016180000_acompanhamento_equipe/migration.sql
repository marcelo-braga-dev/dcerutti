-- Acompanhamento da equipe (D-26): sessões de uso do painel e do caixa, histórico de ações, último login e acesso.
-- AlterTable
ALTER TABLE `user` ADD COLUMN `ultimoAcessoEm` DATETIME(3) NULL,
    ADD COLUMN `ultimoLoginEm` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `sessao_equipe` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuarioId` VARCHAR(191) NOT NULL,
    `inicioEm` DATETIME(3) NOT NULL,
    `fimEm` DATETIME(3) NOT NULL,
    `segundos` INTEGER NOT NULL DEFAULT 0,
    `aparelho` VARCHAR(12) NULL,

    INDEX `sessao_equipe_usuarioId_fimEm_idx`(`usuarioId`, `fimEm`),
    INDEX `sessao_equipe_inicioEm_idx`(`inicioEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atividade_equipe` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `usuarioId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('login', 'cliente_cadastrado', 'cliente_editado', 'pedido_criado', 'oferta_enviada', 'pedido_editado', 'pedido_confirmado', 'pedido_cancelado', 'venda_desfeita', 'venda_balcao', 'venda_caixa', 'venda_manual', 'venda_excluida', 'cupom_pedido', 'whatsapp', 'cupom_enviado', 'convite_enviado') NOT NULL,
    `clienteId` VARCHAR(191) NULL,
    `pedidoId` VARCHAR(191) NULL,
    `valor` DECIMAL(10, 2) NULL,
    `descricao` VARCHAR(200) NULL,
    `aparelho` VARCHAR(12) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `atividade_equipe_usuarioId_criadoEm_idx`(`usuarioId`, `criadoEm`),
    INDEX `atividade_equipe_tipo_criadoEm_idx`(`tipo`, `criadoEm`),
    INDEX `atividade_equipe_criadoEm_idx`(`criadoEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sessao_equipe` ADD CONSTRAINT `sessao_equipe_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `atividade_equipe` ADD CONSTRAINT `atividade_equipe_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

