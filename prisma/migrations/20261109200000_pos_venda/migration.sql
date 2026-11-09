-- AlterTable
ALTER TABLE `atendimento` ADD COLUMN `aceitouOfertasEm` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `atividade_equipe` MODIFY `tipo` ENUM('login', 'cliente_cadastrado', 'cliente_editado', 'pedido_criado', 'oferta_enviada', 'pedido_editado', 'pedido_confirmado', 'pedido_cancelado', 'venda_desfeita', 'venda_balcao', 'venda_caixa', 'venda_manual', 'venda_excluida', 'cupom_pedido', 'whatsapp', 'cupom_enviado', 'convite_enviado', 'numero_cadastrado', 'numero_vinculado', 'numero_desvinculado', 'atendimento_criado', 'atendimento_contato', 'atendimento_fechado', 'atendimento_encaminhado', 'peca_enviada', 'pos_venda_feito') NOT NULL;

-- AlterTable
ALTER TABLE `cliente` ADD COLUMN `aceitaOfertasEm` DATETIME(3) NULL,
    ADD COLUMN `descadastradaEm` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `notificacao` MODIFY `tipo` ENUM('pedido_novo', 'pedido_cancelado', 'carrinho_visto', 'carrinho_respondido', 'sacola_parada', 'prazo_vencendo', 'peca_esgotada', 'meta_batida', 'cliente_nova', 'carrinho_vencendo', 'numero_alterado', 'atendimento_novo', 'retorno_vencendo', 'pos_venda_hoje') NOT NULL;

-- AlterTable
ALTER TABLE `pedido` ADD COLUMN `entregaSituacao` ENUM('a_combinar', 'separando', 'enviado', 'entregue') NOT NULL DEFAULT 'a_combinar',
    ADD COLUMN `pagamentoSituacao` ENUM('a_combinar', 'aguardando', 'pago') NOT NULL DEFAULT 'a_combinar';

-- CreateTable
CREATE TABLE `pos_venda_contato` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` VARCHAR(191) NOT NULL,
    `clienteId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('entrega', 'satisfacao', 'sugestao', 'reativacao') NOT NULL,
    `venceEm` DATETIME(3) NOT NULL,
    `feitoEm` DATETIME(3) NULL,
    `resultado` VARCHAR(30) NULL,
    `usuarioId` VARCHAR(191) NULL,

    INDEX `pos_venda_contato_feitoEm_venceEm_idx`(`feitoEm`, `venceEm`),
    INDEX `pos_venda_contato_clienteId_tipo_idx`(`clienteId`, `tipo`),
    UNIQUE INDEX `pos_venda_contato_pedidoId_tipo_key`(`pedidoId`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pos_venda_contato` ADD CONSTRAINT `pos_venda_contato_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pos_venda_contato` ADD CONSTRAINT `pos_venda_contato_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

