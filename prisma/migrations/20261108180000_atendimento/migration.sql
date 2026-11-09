-- AlterTable
ALTER TABLE `atividade_equipe` MODIFY `tipo` ENUM('login', 'cliente_cadastrado', 'cliente_editado', 'pedido_criado', 'oferta_enviada', 'pedido_editado', 'pedido_confirmado', 'pedido_cancelado', 'venda_desfeita', 'venda_balcao', 'venda_caixa', 'venda_manual', 'venda_excluida', 'cupom_pedido', 'whatsapp', 'cupom_enviado', 'convite_enviado', 'numero_cadastrado', 'numero_vinculado', 'numero_desvinculado', 'atendimento_criado', 'atendimento_contato', 'atendimento_fechado', 'atendimento_encaminhado') NOT NULL;

-- AlterTable
ALTER TABLE `cliente` ADD COLUMN `instagram` VARCHAR(30) NULL,
    ADD COLUMN `origem` ENUM('whatsapp', 'instagram', 'loja', 'vitrine', 'live', 'indicacao', 'outro') NULL;

-- AlterTable
ALTER TABLE `notificacao` MODIFY `tipo` ENUM('pedido_novo', 'pedido_cancelado', 'carrinho_visto', 'carrinho_respondido', 'sacola_parada', 'prazo_vencendo', 'peca_esgotada', 'meta_batida', 'cliente_nova', 'carrinho_vencendo', 'numero_alterado', 'atendimento_novo', 'retorno_vencendo') NOT NULL;

-- CreateTable
CREATE TABLE `atendimento` (
    `id` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(15) NOT NULL,
    `clienteId` VARCHAR(191) NULL,
    `contatoNome` VARCHAR(120) NULL,
    `contatoTelefone` VARCHAR(20) NULL,
    `contatoInstagram` VARCHAR(30) NULL,
    `responsavelId` VARCHAR(191) NULL,
    `numeroId` INTEGER NULL,
    `canal` ENUM('whatsapp', 'instagram', 'loja', 'vitrine', 'live', 'indicacao', 'outro') NOT NULL,
    `etapa` ENUM('novo', 'em_conversa', 'proposta', 'aguardando_pagamento', 'ganho', 'perdido') NOT NULL DEFAULT 'novo',
    `motivoPerda` VARCHAR(30) NULL,
    `proximoContatoEm` DATETIME(3) NULL,
    `primeiroContatoEm` DATETIME(3) NULL,
    `ultimoContatoEm` DATETIME(3) NULL,
    `pedidoId` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizadoEm` DATETIME(3) NOT NULL,
    `fechadoEm` DATETIME(3) NULL,

    UNIQUE INDEX `atendimento_codigo_key`(`codigo`),
    UNIQUE INDEX `atendimento_pedidoId_key`(`pedidoId`),
    INDEX `atendimento_responsavelId_fechadoEm_proximoContatoEm_idx`(`responsavelId`, `fechadoEm`, `proximoContatoEm`),
    INDEX `atendimento_etapa_criadoEm_idx`(`etapa`, `criadoEm`),
    INDEX `atendimento_clienteId_idx`(`clienteId`),
    INDEX `atendimento_contatoTelefone_idx`(`contatoTelefone`),
    INDEX `atendimento_contatoInstagram_idx`(`contatoInstagram`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atendimento_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `atendimentoId` VARCHAR(191) NOT NULL,
    `produtoId` INTEGER NOT NULL,
    `varianteId` INTEGER NOT NULL,
    `quantidade` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `atendimento_item_atendimentoId_varianteId_key`(`atendimentoId`, `varianteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atendimento_registro` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `atendimentoId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('nota', 'contato_whatsapp', 'contato_direct', 'etapa', 'transferencia', 'pedido') NOT NULL,
    `texto` TEXT NULL,
    `usuarioId` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `atendimento_registro_atendimentoId_criadoEm_idx`(`atendimentoId`, `criadoEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resposta_pronta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `titulo` VARCHAR(80) NOT NULL,
    `texto` TEXT NOT NULL,
    `usuarioId` VARCHAR(191) NULL,
    `ordem` INTEGER NOT NULL DEFAULT 0,

    INDEX `resposta_pronta_usuarioId_ordem_idx`(`usuarioId`, `ordem`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `cliente_instagram_idx` ON `cliente`(`instagram`);

-- AddForeignKey
ALTER TABLE `atendimento` ADD CONSTRAINT `atendimento_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `atendimento` ADD CONSTRAINT `atendimento_responsavelId_fkey` FOREIGN KEY (`responsavelId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `atendimento_item` ADD CONSTRAINT `atendimento_item_atendimentoId_fkey` FOREIGN KEY (`atendimentoId`) REFERENCES `atendimento`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `atendimento_registro` ADD CONSTRAINT `atendimento_registro_atendimentoId_fkey` FOREIGN KEY (`atendimentoId`) REFERENCES `atendimento`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `atendimento_registro` ADD CONSTRAINT `atendimento_registro_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resposta_pronta` ADD CONSTRAINT `resposta_pronta_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Respostas com que a loja começa (o proprietário revisa em Respostas prontas).
INSERT INTO `resposta_pronta` (`titulo`, `texto`, `ordem`) VALUES
  ('Saudação', 'Oi, {nome}! Aqui é {vendedora}, da {loja}. Como posso te ajudar?', 0),
  ('Peça disponível', 'Oi, {nome}! A {peca} está disponível nos tamanhos {tamanhos}, por {preco}. Qual tamanho você usa?', 1),
  ('Provar em casa', '{nome}, você pode provar em casa: separo as peças, você experimenta e fica só com o que gostar. Quer que eu monte para você?', 2),
  ('Pedir o WhatsApp', 'Oi, {nome}! Para eu te mandar fotos, vídeos e os valores certinho, me passa seu WhatsApp com DDD?', 3),
  ('Pagamento', '{nome}, separei suas peças. Me confirma como prefere pagar e eu já finalizo para você.', 4),
  ('Retomar conversa', 'Oi, {nome}! Aqui é {vendedora}, da {loja}. Ficou com alguma dúvida sobre as peças que você viu?', 5),
  ('Pós-venda', 'Oi, {nome}! Aqui é {vendedora}, da {loja}. Suas peças chegaram bem? Conta para mim o que achou!', 6);
