-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `image` TEXT NULL,
    `papel` ENUM('cliente', 'vendedor', 'gestor') NOT NULL DEFAULT 'cliente',
    `telefone` VARCHAR(20) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session` (
    `id` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `userId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `session_token_key`(`token`),
    INDEX `session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NULL,
    `refreshToken` TEXT NULL,
    `idToken` TEXT NULL,
    `accessTokenExpiresAt` DATETIME(3) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `scope` TEXT NULL,
    `password` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `account_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `verification_identifier_idx`(`identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cliente` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `vendedorId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `telefone` VARCHAR(20) NOT NULL,
    `email` VARCHAR(191) NULL,
    `endereco` VARCHAR(191) NULL,
    `cidade` VARCHAR(191) NULL,
    `cep` CHAR(9) NULL,
    `preferencias` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `cliente_userId_key`(`userId`),
    INDEX `cliente_vendedorId_idx`(`vendedorId`),
    INDEX `cliente_telefone_idx`(`telefone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meta` (
    `id` VARCHAR(191) NOT NULL,
    `vendedorId` VARCHAR(191) NOT NULL,
    `mes` CHAR(7) NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,

    UNIQUE INDEX `meta_vendedorId_mes_key`(`vendedorId`, `mes`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `marca` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `marca_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `categoria_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `referencia` VARCHAR(20) NOT NULL,
    `nome` VARCHAR(160) NOT NULL,
    `marcaId` INTEGER NOT NULL,
    `categoriaId` INTEGER NOT NULL,
    `subcategoria` VARCHAR(191) NULL,
    `genero` ENUM('feminino', 'masculino', 'unissex') NOT NULL,
    `estacao` ENUM('inverno', 'verao') NULL,
    `cor` VARCHAR(191) NULL,
    `composicao` TEXT NULL,
    `descricao` TEXT NULL,
    `destaques` JSON NULL,
    `preco` DECIMAL(10, 2) NOT NULL,
    `precoCheio` DECIMAL(10, 2) NOT NULL,
    `imperdivel` BOOLEAN NOT NULL DEFAULT false,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `linkOrigem` TEXT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `atualizadoEm` DATETIME(3) NOT NULL,

    UNIQUE INDEX `produto_referencia_key`(`referencia`),
    INDEX `produto_ativo_genero_categoriaId_idx`(`ativo`, `genero`, `categoriaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produto_imagem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `produtoId` INTEGER NOT NULL,
    `url` TEXT NOT NULL,
    `ordem` INTEGER NOT NULL DEFAULT 0,

    INDEX `produto_imagem_produtoId_ordem_idx`(`produtoId`, `ordem`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `variante` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `produtoId` INTEGER NOT NULL,
    `tamanho` VARCHAR(5) NOT NULL,
    `ordem` INTEGER NOT NULL DEFAULT 0,
    `estoque` INTEGER NOT NULL DEFAULT 0,
    `reservado` INTEGER NOT NULL DEFAULT 0,
    `codigoInterno` VARCHAR(20) NULL,
    `ean` VARCHAR(14) NULL,

    UNIQUE INDEX `variante_codigoInterno_key`(`codigoInterno`),
    UNIQUE INDEX `variante_produtoId_tamanho_key`(`produtoId`, `tamanho`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custo` (
    `produtoId` INTEGER NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `atualizadoEm` DATETIME(3) NOT NULL,

    PRIMARY KEY (`produtoId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimento_estoque` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `varianteId` INTEGER NOT NULL,
    `delta` INTEGER NOT NULL,
    `motivo` ENUM('entrada', 'ajuste', 'venda') NOT NULL,
    `observacao` VARCHAR(191) NULL,
    `pedidoId` VARCHAR(191) NULL,
    `usuarioId` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `movimento_estoque_varianteId_criadoEm_idx`(`varianteId`, `criadoEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedido` (
    `id` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(15) NOT NULL,
    `tipo` ENUM('compra', 'condicional') NOT NULL,
    `status` ENUM('pendente', 'confirmado', 'cancelado') NOT NULL DEFAULT 'pendente',
    `origem` ENUM('loja', 'vendedor') NOT NULL,
    `clienteId` VARCHAR(191) NOT NULL,
    `vendedorId` VARCHAR(191) NOT NULL,
    `nomeCliente` VARCHAR(191) NOT NULL,
    `telefoneCliente` VARCHAR(20) NOT NULL,
    `cep` CHAR(9) NULL,
    `total` DECIMAL(10, 2) NOT NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmadoEm` DATETIME(3) NULL,
    `canceladoEm` DATETIME(3) NULL,

    UNIQUE INDEX `pedido_codigo_key`(`codigo`),
    INDEX `pedido_vendedorId_status_criadoEm_idx`(`vendedorId`, `status`, `criadoEm`),
    INDEX `pedido_clienteId_idx`(`clienteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedido_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pedidoId` VARCHAR(191) NOT NULL,
    `varianteId` INTEGER NOT NULL,
    `produtoId` INTEGER NOT NULL,
    `referencia` VARCHAR(20) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `marca` VARCHAR(191) NOT NULL,
    `cor` VARCHAR(191) NULL,
    `categoria` VARCHAR(191) NOT NULL,
    `imagem` TEXT NULL,
    `tamanho` VARCHAR(5) NOT NULL,
    `codigoInterno` VARCHAR(191) NULL,
    `quantidade` INTEGER NOT NULL,
    `precoUnitario` DECIMAL(10, 2) NOT NULL,
    `custoUnitario` DECIMAL(10, 2) NULL,
    `situacao` ENUM('pendente', 'vendido', 'devolvido') NOT NULL DEFAULT 'pendente',

    INDEX `pedido_item_pedidoId_idx`(`pedidoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `venda` (
    `id` VARCHAR(191) NOT NULL,
    `pedidoId` VARCHAR(191) NULL,
    `vendedorId` VARCHAR(191) NOT NULL,
    `clienteId` VARCHAR(191) NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `custo` DECIMAL(10, 2) NULL,
    `data` DATETIME(3) NOT NULL,
    `observacao` VARCHAR(191) NULL,
    `criadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `venda_pedidoId_key`(`pedidoId`),
    INDEX `venda_vendedorId_data_idx`(`vendedorId`, `data`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracao` (
    `chave` VARCHAR(191) NOT NULL,
    `valor` JSON NOT NULL,

    PRIMARY KEY (`chave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contador` (
    `nome` VARCHAR(191) NOT NULL,
    `valor` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`nome`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account` ADD CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cliente` ADD CONSTRAINT `cliente_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cliente` ADD CONSTRAINT `cliente_vendedorId_fkey` FOREIGN KEY (`vendedorId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meta` ADD CONSTRAINT `meta_vendedorId_fkey` FOREIGN KEY (`vendedorId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto` ADD CONSTRAINT `produto_marcaId_fkey` FOREIGN KEY (`marcaId`) REFERENCES `marca`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto` ADD CONSTRAINT `produto_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `categoria`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_imagem` ADD CONSTRAINT `produto_imagem_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `variante` ADD CONSTRAINT `variante_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custo` ADD CONSTRAINT `custo_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `produto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimento_estoque` ADD CONSTRAINT `movimento_estoque_varianteId_fkey` FOREIGN KEY (`varianteId`) REFERENCES `variante`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedido` ADD CONSTRAINT `pedido_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedido_item` ADD CONSTRAINT `pedido_item_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedido_item` ADD CONSTRAINT `pedido_item_varianteId_fkey` FOREIGN KEY (`varianteId`) REFERENCES `variante`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venda` ADD CONSTRAINT `venda_pedidoId_fkey` FOREIGN KEY (`pedidoId`) REFERENCES `pedido`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venda` ADD CONSTRAINT `venda_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `cliente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
