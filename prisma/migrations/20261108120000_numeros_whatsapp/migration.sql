-- AlterTable
ALTER TABLE `atividade_equipe` ADD COLUMN `numeroId` INTEGER NULL,
    MODIFY `tipo` ENUM('login', 'cliente_cadastrado', 'cliente_editado', 'pedido_criado', 'oferta_enviada', 'pedido_editado', 'pedido_confirmado', 'pedido_cancelado', 'venda_desfeita', 'venda_balcao', 'venda_caixa', 'venda_manual', 'venda_excluida', 'cupom_pedido', 'whatsapp', 'cupom_enviado', 'convite_enviado', 'numero_cadastrado', 'numero_vinculado', 'numero_desvinculado') NOT NULL;

-- AlterTable
ALTER TABLE `notificacao` MODIFY `tipo` ENUM('pedido_novo', 'pedido_cancelado', 'carrinho_visto', 'carrinho_respondido', 'sacola_parada', 'prazo_vencendo', 'peca_esgotada', 'meta_batida', 'cliente_nova', 'carrinho_vencendo', 'numero_alterado') NOT NULL;

-- AlterTable
ALTER TABLE `pedido` ADD COLUMN `numeroId` INTEGER NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `numeroPrincipalId` INTEGER NULL;

-- CreateTable
CREATE TABLE `numero_whatsapp` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `telefone` VARCHAR(13) NOT NULL,
    `apelido` VARCHAR(60) NOT NULL,
    `status` ENUM('ativo', 'pausado', 'desativado') NOT NULL DEFAULT 'ativo',
    `padrao` BOOLEAN NOT NULL DEFAULT false,
    `observacao` VARCHAR(300) NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizadoEm` DATETIME(3) NOT NULL,

    UNIQUE INDEX `numero_whatsapp_telefone_key`(`telefone`),
    INDEX `numero_whatsapp_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vinculo_numero` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numeroId` INTEGER NOT NULL,
    `usuarioId` VARCHAR(191) NOT NULL,
    `conexao` ENUM('aguardando', 'conectado') NOT NULL DEFAULT 'aguardando',
    `inicioEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `conectadoEm` DATETIME(3) NULL,
    `fimEm` DATETIME(3) NULL,
    `desconectadoEm` DATETIME(3) NULL,
    `motivoFim` VARCHAR(200) NULL,
    `vinculadoPorId` VARCHAR(191) NULL,
    `encerradoPorId` VARCHAR(191) NULL,

    INDEX `vinculo_numero_numeroId_fimEm_idx`(`numeroId`, `fimEm`),
    INDEX `vinculo_numero_usuarioId_fimEm_idx`(`usuarioId`, `fimEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `atividade_equipe_numeroId_criadoEm_idx` ON `atividade_equipe`(`numeroId`, `criadoEm`);

-- CreateIndex
CREATE INDEX `pedido_numeroId_criadoEm_idx` ON `pedido`(`numeroId`, `criadoEm`);

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `user_numeroPrincipalId_fkey` FOREIGN KEY (`numeroPrincipalId`) REFERENCES `numero_whatsapp`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedido` ADD CONSTRAINT `pedido_numeroId_fkey` FOREIGN KEY (`numeroId`) REFERENCES `numero_whatsapp`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `numero_whatsapp` ADD CONSTRAINT `numero_whatsapp_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vinculo_numero` ADD CONSTRAINT `vinculo_numero_numeroId_fkey` FOREIGN KEY (`numeroId`) REFERENCES `numero_whatsapp`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vinculo_numero` ADD CONSTRAINT `vinculo_numero_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- O WhatsApp da loja de hoje vira o primeiro número cadastrado, como padrão (D-31).
INSERT INTO `numero_whatsapp` (`telefone`, `apelido`, `padrao`, `atualizadoEm`)
SELECT COALESCE((SELECT JSON_UNQUOTE(`valor`) FROM `configuracao` WHERE `chave` = 'whatsappLoja'), '49988036499'), 'Loja', true, CURRENT_TIMESTAMP(3);
