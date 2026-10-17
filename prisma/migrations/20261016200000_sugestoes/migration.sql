-- Sugestões para você (D-27): proposta do vendedor que a cliente responde pelo link assinado.
-- CreateTable
CREATE TABLE `sugestao` (
    `id` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(15) NOT NULL,
    `vendedorId` VARCHAR(191) NOT NULL,
    `clienteId` VARCHAR(191) NOT NULL,
    `titulo` VARCHAR(80) NOT NULL,
    `mensagem` TEXT NULL,
    `status` ENUM('enviada', 'vista', 'respondida', 'convertida', 'cancelada') NOT NULL DEFAULT 'enviada',
    `validaAte` DATETIME(3) NOT NULL,
    `criadaEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `vistaEm` DATETIME(3) NULL,
    `vezesVista` INTEGER NOT NULL DEFAULT 0,
    `respondidaEm` DATETIME(3) NULL,
    `pedidoId` VARCHAR(191) NULL,

    UNIQUE INDEX `sugestao_codigo_key`(`codigo`),
    UNIQUE INDEX `sugestao_pedidoId_key`(`pedidoId`),
    INDEX `sugestao_vendedorId_criadaEm_idx`(`vendedorId`, `criadaEm`),
    INDEX `sugestao_clienteId_criadaEm_idx`(`clienteId`, `criadaEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sugestao_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sugestaoId` VARCHAR(191) NOT NULL,
    `produtoId` INTEGER NOT NULL,
    `varianteId` INTEGER NULL,
    `precoOferta` DECIMAL(10, 2) NULL,
    `nota` VARCHAR(200) NULL,
    `ordem` INTEGER NOT NULL DEFAULT 0,
    `escolha` ENUM('pendente', 'quero', 'talvez', 'nao') NOT NULL DEFAULT 'pendente',
    `varianteEscolhidaId` INTEGER NULL,
    `quantidade` INTEGER NOT NULL DEFAULT 1,
    `adicionadoPelaCliente` BOOLEAN NOT NULL DEFAULT false,

    INDEX `sugestao_item_sugestaoId_idx`(`sugestaoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sugestao` ADD CONSTRAINT `sugestao_vendedorId_fkey` FOREIGN KEY (`vendedorId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sugestao` ADD CONSTRAINT `sugestao_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sugestao_item` ADD CONSTRAINT `sugestao_item_sugestaoId_fkey` FOREIGN KEY (`sugestaoId`) REFERENCES `sugestao`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

