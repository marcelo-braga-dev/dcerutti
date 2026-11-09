-- AlterTable
ALTER TABLE `atendimento` ADD COLUMN `aceitouContatoEm` DATETIME(3) NULL,
    MODIFY `canal` ENUM('whatsapp', 'instagram', 'loja', 'link_peca', 'vitrine', 'live', 'indicacao', 'outro') NOT NULL;

-- AlterTable
ALTER TABLE `atendimento_registro` MODIFY `tipo` ENUM('nota', 'contato_whatsapp', 'contato_direct', 'etapa', 'transferencia', 'pedido', 'envio_peca') NOT NULL;

-- AlterTable
ALTER TABLE `atividade_equipe` MODIFY `tipo` ENUM('login', 'cliente_cadastrado', 'cliente_editado', 'pedido_criado', 'oferta_enviada', 'pedido_editado', 'pedido_confirmado', 'pedido_cancelado', 'venda_desfeita', 'venda_balcao', 'venda_caixa', 'venda_manual', 'venda_excluida', 'cupom_pedido', 'whatsapp', 'cupom_enviado', 'convite_enviado', 'numero_cadastrado', 'numero_vinculado', 'numero_desvinculado', 'atendimento_criado', 'atendimento_contato', 'atendimento_fechado', 'atendimento_encaminhado', 'peca_enviada') NOT NULL;

-- AlterTable
ALTER TABLE `cliente` MODIFY `origem` ENUM('whatsapp', 'instagram', 'loja', 'link_peca', 'vitrine', 'live', 'indicacao', 'outro') NULL;

