-- Pagamento online com Mercado Pago (docs/27).
-- AlterTable
ALTER TABLE `notificacao` MODIFY `tipo` ENUM('pedido_novo', 'pedido_cancelado', 'carrinho_visto', 'carrinho_respondido', 'sacola_parada', 'prazo_vencendo', 'peca_esgotada', 'meta_batida', 'cliente_nova', 'carrinho_vencendo', 'numero_alterado', 'atendimento_novo', 'retorno_vencendo', 'pos_venda_hoje', 'pagamento_aprovado', 'pagamento_problema') NOT NULL;

-- AlterTable
ALTER TABLE `pagamento` ADD COLUMN `cobrancaId` VARCHAR(191) NULL,
    MODIFY `forma` ENUM('pix', 'debito', 'credito', 'dinheiro', 'mercado_pago') NOT NULL;

-- AlterTable
ALTER TABLE `pedido` MODIFY `pagamentoSituacao` ENUM('a_combinar', 'aguardando', 'pago', 'estornado') NOT NULL DEFAULT 'a_combinar';

-- CreateTable
CREATE TABLE `cobranca` (
    `id` VARCHAR(191) NOT NULL,
    `pedidoId` VARCHAR(191) NOT NULL,
    `metodo` ENUM('pix', 'checkout') NOT NULL,
    `status` ENUM('criada', 'pendente', 'aprovada', 'recusada', 'expirada', 'cancelada', 'estornada', 'estornada_parcial', 'contestada') NOT NULL DEFAULT 'criada',
    `valor` DECIMAL(10, 2) NOT NULL,
    `chave` VARCHAR(64) NOT NULL,
    `mpOrderId` VARCHAR(64) NULL,
    `mpPaymentId` VARCHAR(64) NULL,
    `statusMp` VARCHAR(60) NULL,
    `pixCopiaECola` TEXT NULL,
    `checkoutUrl` TEXT NULL,
    `expiraEm` DATETIME(3) NULL,
    `reservou` BOOLEAN NOT NULL DEFAULT false,
    `semEstoque` BOOLEAN NOT NULL DEFAULT false,
    `aprovadaEm` DATETIME(3) NULL,
    `meio` VARCHAR(30) NULL,
    `tipoMeio` VARCHAR(30) NULL,
    `parcelas` INTEGER NULL,
    `taxa` DECIMAL(10, 2) NULL,
    `valorEstornado` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `criadaPorId` VARCHAR(191) NULL,
    `consultadaEm` DATETIME(3) NULL,
    `criadaEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizadaEm` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cobranca_chave_key`(`chave`),
    UNIQUE INDEX `cobranca_mpOrderId_key`(`mpOrderId`),
    INDEX `cobranca_pedidoId_status_idx`(`pedidoId`, `status`),
    INDEX `cobranca_status_expiraEm_idx`(`status`, `expiraEm`),
    INDEX `cobranca_criadaEm_idx`(`criadaEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evento_pagamento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cobrancaId` VARCHAR(191) NULL,
    `origem` VARCHAR(15) NOT NULL,
    `requestId` VARCHAR(80) NULL,
    `tipo` VARCHAR(60) NOT NULL,
    `mpOrderId` VARCHAR(64) NULL,
    `statusMp` VARCHAR(60) NULL,
    `dados` JSON NULL,
    `processadoEm` DATETIME(3) NULL,
    `erro` TEXT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `evento_pagamento_requestId_key`(`requestId`),
    INDEX `evento_pagamento_cobrancaId_criadoEm_idx`(`cobrancaId`, `criadoEm`),
    INDEX `evento_pagamento_mpOrderId_idx`(`mpOrderId`),
    INDEX `evento_pagamento_criadoEm_idx`(`criadoEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `pagamento_cobrancaId_key` ON `pagamento`(`cobrancaId`);

-- AddForeignKey
ALTER TABLE `pagamento` ADD CONSTRAINT `pagamento_cobrancaId_fkey` FOREIGN KEY (`cobrancaId`) REFERENCES `cobranca`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cobranca` ADD CONSTRAINT `cobranca_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evento_pagamento` ADD CONSTRAINT `evento_pagamento_cobrancaId_fkey` FOREIGN KEY (`cobrancaId`) REFERENCES `cobranca`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

