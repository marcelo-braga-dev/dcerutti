-- Cupons de desconto (docs/20-cupons.md): cadastro do gestor, abrangência e o uso gravado no pedido.
-- AlterTable
ALTER TABLE `pedido` ADD COLUMN `codigoCupom` VARCHAR(30) NULL,
    ADD COLUMN `cupomId` INTEGER NULL,
    ADD COLUMN `descontoCupom` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `freteCupom` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `pedido_item` ADD COLUMN `descontoCupom` DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `cupom` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(30) NOT NULL,
    `descricao` VARCHAR(200) NULL,
    `tipo` ENUM('percentual', 'valor', 'freteGratis') NOT NULL,
    `valor` DECIMAL(10, 2) NULL,
    `tetoDesconto` DECIMAL(10, 2) NULL,
    `minimoCompra` DECIMAL(10, 2) NULL,
    `inicioEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fimEm` DATETIME(3) NULL,
    `limiteTotal` INTEGER NULL,
    `limitePorCliente` INTEGER NULL DEFAULT 1,
    `somentePrimeiraCompra` BOOLEAN NOT NULL DEFAULT false,
    `valePromocao` BOOLEAN NOT NULL DEFAULT false,
    `quemAplica` ENUM('cliente', 'equipe', 'ambos') NOT NULL DEFAULT 'ambos',
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `criadoPorId` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizadoEm` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cupom_codigo_key`(`codigo`),
    INDEX `cupom_ativo_inicioEm_idx`(`ativo`, `inicioEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cupom_categoria` (
    `cupomId` INTEGER NOT NULL,
    `categoriaId` INTEGER NOT NULL,

    INDEX `cupom_categoria_categoriaId_idx`(`categoriaId`),
    PRIMARY KEY (`cupomId`, `categoriaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cupom_marca` (
    `cupomId` INTEGER NOT NULL,
    `marcaId` INTEGER NOT NULL,

    INDEX `cupom_marca_marcaId_idx`(`marcaId`),
    PRIMARY KEY (`cupomId`, `marcaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cupom_produto` (
    `cupomId` INTEGER NOT NULL,
    `produtoId` INTEGER NOT NULL,

    INDEX `cupom_produto_produtoId_idx`(`produtoId`),
    PRIMARY KEY (`cupomId`, `produtoId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cupom_cliente` (
    `cupomId` INTEGER NOT NULL,
    `clienteId` VARCHAR(191) NOT NULL,

    INDEX `cupom_cliente_clienteId_idx`(`clienteId`),
    PRIMARY KEY (`cupomId`, `clienteId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `pedido_cupomId_status_idx` ON `pedido`(`cupomId`, `status`);

-- AddForeignKey
ALTER TABLE `pedido` ADD CONSTRAINT `pedido_cupomId_fkey` FOREIGN KEY (`cupomId`) REFERENCES `cupom`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cupom` ADD CONSTRAINT `cupom_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cupom_categoria` ADD CONSTRAINT `cupom_categoria_cupomId_fkey` FOREIGN KEY (`cupomId`) REFERENCES `cupom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cupom_categoria` ADD CONSTRAINT `cupom_categoria_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `categoria`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cupom_marca` ADD CONSTRAINT `cupom_marca_cupomId_fkey` FOREIGN KEY (`cupomId`) REFERENCES `cupom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cupom_marca` ADD CONSTRAINT `cupom_marca_marcaId_fkey` FOREIGN KEY (`marcaId`) REFERENCES `marca`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cupom_produto` ADD CONSTRAINT `cupom_produto_cupomId_fkey` FOREIGN KEY (`cupomId`) REFERENCES `cupom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cupom_produto` ADD CONSTRAINT `cupom_produto_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cupom_cliente` ADD CONSTRAINT `cupom_cliente_cupomId_fkey` FOREIGN KEY (`cupomId`) REFERENCES `cupom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cupom_cliente` ADD CONSTRAINT `cupom_cliente_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

