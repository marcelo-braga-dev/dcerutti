-- Histórico do cliente (docs/21): navegação na loja, cópia da sacola e último login/acesso.
-- AlterTable
ALTER TABLE `cliente` ADD COLUMN `ultimoAcessoEm` DATETIME(3) NULL,
    ADD COLUMN `ultimoLoginEm` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `atividade` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `clienteId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('login', 'acesso', 'pagina', 'produto', 'busca', 'filtro', 'tamanho', 'sacola', 'cupom', 'whatsapp') NOT NULL,
    `caminho` VARCHAR(300) NULL,
    `produtoId` INTEGER NULL,
    `varianteId` INTEGER NULL,
    `termo` VARCHAR(100) NULL,
    `dados` JSON NULL,
    `duracaoSeg` INTEGER NULL,
    `aparelho` VARCHAR(12) NULL,
    `ref` VARCHAR(16) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `atividade_clienteId_criadoEm_idx`(`clienteId`, `criadoEm`),
    INDEX `atividade_clienteId_ref_idx`(`clienteId`, `ref`),
    INDEX `atividade_clienteId_tipo_produtoId_idx`(`clienteId`, `tipo`, `produtoId`),
    INDEX `atividade_produtoId_criadoEm_idx`(`produtoId`, `criadoEm`),
    INDEX `atividade_tipo_criadoEm_idx`(`tipo`, `criadoEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sacola_cliente` (
    `clienteId` VARCHAR(191) NOT NULL,
    `itens` JSON NOT NULL,
    `atualizadoEm` DATETIME(3) NOT NULL,
    `avisadoEm` DATETIME(3) NULL,

    INDEX `sacola_cliente_atualizadoEm_idx`(`atualizadoEm`),
    PRIMARY KEY (`clienteId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `cliente_ultimoAcessoEm_idx` ON `cliente`(`ultimoAcessoEm`);

-- AddForeignKey
ALTER TABLE `atividade` ADD CONSTRAINT `atividade_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sacola_cliente` ADD CONSTRAINT `sacola_cliente_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

